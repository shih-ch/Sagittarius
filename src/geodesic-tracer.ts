// src/geodesic-tracer.ts — CPU-side geodesic ray tracer
// Replicates the GPU shader's ray marching for trajectory visualization.

import { mat4, vec3, vec4 } from "gl-matrix";
import type { TrajectoryPoint, TraceResult, BlackHoleParams } from "./types";
import { DISK_INNER_RATIO, DISK_OUTER_RATIO, kerrEventHorizon, kerrIsco } from "./math/constants";

const ESCAPE_MULT = 3.0;
const MIN_ESCAPE = 80.0;
const MAX_LOOP = 10000;

// Geodesic derivatives: state = [r, phi, dr/dl, dphi/dl]
// Mirrors blackhole.frag geodesicDerivs() exactly
function geodesicDerivs(
  r: number, phi: number, vr: number, vphi: number,
  rs: number, a: number
): [number, number, number, number] {
  const rSafe = Math.max(r, 0.001);

  // Schwarzschild null geodesic
  let d2r = (rSafe - 1.5 * rs) * vphi * vphi;
  let d2phi = -(2.0 / rSafe) * vr * vphi;

  // Kerr frame-dragging corrections
  const r3 = rSafe * rSafe * rSafe;
  d2r += -a * a * rs / (2.0 * r3) + a * rs * vphi / (rSafe * rSafe);
  d2phi += a * rs * vr / r3;

  return [vr, vphi, d2r, d2phi];
}

function rk4Step(
  r: number, phi: number, vr: number, vphi: number,
  rs: number, a: number, h: number
): [number, number, number, number] {
  const k1 = geodesicDerivs(r, phi, vr, vphi, rs, a);
  const k2 = geodesicDerivs(
    r + k1[0] * h * 0.5, phi + k1[1] * h * 0.5,
    vr + k1[2] * h * 0.5, vphi + k1[3] * h * 0.5, rs, a
  );
  const k3 = geodesicDerivs(
    r + k2[0] * h * 0.5, phi + k2[1] * h * 0.5,
    vr + k2[2] * h * 0.5, vphi + k2[3] * h * 0.5, rs, a
  );
  const k4 = geodesicDerivs(
    r + k3[0] * h, phi + k3[1] * h,
    vr + k3[2] * h, vphi + k3[3] * h, rs, a
  );

  return [
    r + (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) * h / 6,
    phi + (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) * h / 6,
    vr + (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) * h / 6,
    vphi + (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]) * h / 6,
  ];
}

export function traceGeodesic(
  ndcX: number,
  ndcY: number,
  invVP: Float32Array,
  cameraPos: [number, number, number],
  params: BlackHoleParams
): TraceResult {
  const mass = params.mass;
  const spin = params.spin;
  const rs = 2.0 * mass;
  const a = spin * mass;
  const stepSize = params.stepSize;
  const maxSteps = Math.min(params.maxSteps, MAX_LOOP);

  // Kerr event horizon
  const r_eh = kerrEventHorizon(mass, spin);

  // Kerr ISCO
  const r_isco = kerrIsco(mass, spin);
  const rInner = Math.max(r_isco, r_eh + 0.01);
  const rOuter = DISK_OUTER_RATIO * rs;

  // 1. Unproject pixel to world ray (matches shader lines 335–343)
  const nearNdc = vec4.fromValues(ndcX, ndcY, -1.0, 1.0);
  const farNdc = vec4.fromValues(ndcX, ndcY, 1.0, 1.0);

  const nearWorld = vec4.create();
  const farWorld = vec4.create();
  vec4.transformMat4(nearWorld, nearNdc, invVP as mat4);
  vec4.transformMat4(farWorld, farNdc, invVP as mat4);

  // Perspective divide
  vec3.scale(nearWorld as unknown as vec3, nearWorld as unknown as vec3, 1.0 / nearWorld[3]);
  vec3.scale(farWorld as unknown as vec3, farWorld as unknown as vec3, 1.0 / farWorld[3]);

  const rayOrigin = vec3.fromValues(cameraPos[0], cameraPos[1], cameraPos[2]);
  const rayDir = vec3.create();
  vec3.subtract(rayDir, farWorld as unknown as vec3, nearWorld as unknown as vec3);
  vec3.normalize(rayDir, rayDir);

  // 2. Orbital plane basis (matches shader lines 346–372)
  const r0 = vec3.length(rayOrigin);

  if (r0 <= r_eh && rs > 0) {
    return {
      trajectory: [{ r: r0, phi: 0, worldPos: [...cameraPos] }],
      outcome: 'absorbed',
      totalDeflection: 0,
      closestApproach: r0,
      diskCrossings: 0,
      e1: [cameraPos[0] / r0, cameraPos[1] / r0, cameraPos[2] / r0],
      e2: [0, 1, 0],
    };
  }

  const e1 = vec3.create();
  vec3.scale(e1, rayOrigin, 1.0 / r0);

  const drInit = vec3.dot(rayDir, e1);
  const tangent = vec3.create();
  vec3.scaleAndAdd(tangent, rayDir, e1, -drInit);
  const tangentLen = vec3.length(tangent);

  const e2 = vec3.create();
  if (tangentLen > 1e-6) {
    vec3.scale(e2, tangent, 1.0 / tangentLen);
  } else {
    const up = Math.abs(e1[1]) < 0.99
      ? vec3.fromValues(0, 1, 0)
      : vec3.fromValues(1, 0, 0);
    vec3.cross(e2, e1, up);
    vec3.normalize(e2, e2);
  }

  // 3. Initial state
  let r = r0;
  let phi = 0;
  let vr = drInit;
  let vphi = tangentLen / r0;

  const escapeR = Math.max(MIN_ESCAPE, r0 * ESCAPE_MULT);
  const trajectory: TrajectoryPoint[] = [];
  let closestApproach = r;
  let totalAngle = 0;
  let diskCrossings = 0;
  let outcome: TraceResult['outcome'] = 'max_steps';

  // Record initial point
  const wp0: [number, number, number] = [
    r * (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]),
    r * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]),
    r * (Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2]),
  ];
  trajectory.push({ r, phi, worldPos: wp0 });

  // Sample trajectory at regular intervals (don't store every step)
  const sampleInterval = Math.max(1, Math.floor(maxSteps / 500));

  // 4. RK4 loop
  for (let i = 0; i < maxSteps; i++) {
    const prevY = r * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]);
    const prevPhi = phi;

    // Adaptive step
    const adaptH = stepSize * Math.max(0.15, Math.min(1.0, r / (4.0 * rs + 0.001)));

    [r, phi, vr, vphi] = rk4Step(r, phi, vr, vphi, rs, a, adaptH);

    // Track angle
    totalAngle += Math.abs(phi - prevPhi);

    // Closest approach
    if (r < closestApproach) closestApproach = r;

    const newY = r * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]);

    // Check disk crossing
    if (params.showDisk && prevY * newY < 0) {
      const tCross = Math.abs(prevY) / (Math.abs(prevY) + Math.abs(newY) + 1e-10);
      const crossR = r; // approximate
      if (crossR >= rInner - 0.5 * rs && crossR <= rOuter + rs) {
        diskCrossings++;
      }
    }

    // Check event horizon
    if (r <= r_eh && rs > 0) {
      outcome = 'absorbed';
      const wp: [number, number, number] = [
        r * (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]),
        r * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]),
        r * (Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2]),
      ];
      trajectory.push({ r, phi, worldPos: wp });
      break;
    }

    // Check escape
    if (r > escapeR) {
      outcome = diskCrossings > 0 ? 'disk_hit' : 'escaped';
      const wp: [number, number, number] = [
        r * (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]),
        r * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]),
        r * (Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2]),
      ];
      trajectory.push({ r, phi, worldPos: wp });
      break;
    }

    // Sample points
    if (i % sampleInterval === 0) {
      const wp: [number, number, number] = [
        r * (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]),
        r * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]),
        r * (Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2]),
      ];
      trajectory.push({ r, phi, worldPos: wp });
    }
  }

  return {
    trajectory,
    outcome,
    totalDeflection: totalAngle,
    closestApproach,
    diskCrossings,
    e1: [e1[0], e1[1], e1[2]],
    e2: [e2[0], e2[1], e2[2]],
  };
}
