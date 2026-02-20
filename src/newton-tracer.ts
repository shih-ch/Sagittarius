// src/newton-tracer.ts — Newtonian gravity ray tracer for comparison
// Same structure as geodesic-tracer.ts but WITHOUT the GR correction term.

import { mat4, vec3, vec4 } from "gl-matrix";
import type { TrajectoryPoint, TraceResult, BlackHoleParams } from "./types";
import { DISK_OUTER_RATIO, kerrEventHorizon } from "./math/constants";

const ESCAPE_MULT = 3.0;
const MIN_ESCAPE = 80.0;
const MAX_LOOP = 10000;

// Newtonian geodesic derivatives: NO -1.5*rs*vphi² GR correction
function newtonDerivs(
  r: number, _phi: number, vr: number, vphi: number,
  rs: number
): [number, number, number, number] {
  const rSafe = Math.max(r, 0.001);

  // Newtonian: d2r = -rs/(2r²) + r·vphi² (no GR correction)
  const d2r = -rs / (2.0 * rSafe * rSafe) + rSafe * vphi * vphi;
  const d2phi = -(2.0 / rSafe) * vr * vphi;

  return [vr, vphi, d2r, d2phi];
}

function rk4Step(
  r: number, phi: number, vr: number, vphi: number,
  rs: number, h: number
): [number, number, number, number] {
  const k1 = newtonDerivs(r, phi, vr, vphi, rs);
  const k2 = newtonDerivs(
    r + k1[0] * h * 0.5, phi + k1[1] * h * 0.5,
    vr + k1[2] * h * 0.5, vphi + k1[3] * h * 0.5, rs
  );
  const k3 = newtonDerivs(
    r + k2[0] * h * 0.5, phi + k2[1] * h * 0.5,
    vr + k2[2] * h * 0.5, vphi + k2[3] * h * 0.5, rs
  );
  const k4 = newtonDerivs(
    r + k3[0] * h, phi + k3[1] * h,
    vr + k3[2] * h, vphi + k3[3] * h, rs
  );

  return [
    r + (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) * h / 6,
    phi + (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) * h / 6,
    vr + (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) * h / 6,
    vphi + (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]) * h / 6,
  ];
}

export function traceNewtonGeodesic(
  ndcX: number,
  ndcY: number,
  invVP: Float32Array,
  cameraPos: [number, number, number],
  params: BlackHoleParams
): TraceResult {
  const mass = params.mass;
  const rs = 2.0 * mass;
  const stepSize = params.stepSize;
  const maxSteps = Math.min(params.maxSteps, MAX_LOOP);

  // 1. Unproject pixel to world ray (identical to GR tracer)
  const nearNdc = vec4.fromValues(ndcX, ndcY, -1.0, 1.0);
  const farNdc = vec4.fromValues(ndcX, ndcY, 1.0, 1.0);

  const nearWorld = vec4.create();
  const farWorld = vec4.create();
  vec4.transformMat4(nearWorld, nearNdc, invVP as mat4);
  vec4.transformMat4(farWorld, farNdc, invVP as mat4);

  vec3.scale(nearWorld as unknown as vec3, nearWorld as unknown as vec3, 1.0 / nearWorld[3]);
  vec3.scale(farWorld as unknown as vec3, farWorld as unknown as vec3, 1.0 / farWorld[3]);

  const rayOrigin = vec3.fromValues(cameraPos[0], cameraPos[1], cameraPos[2]);
  const rayDir = vec3.create();
  vec3.subtract(rayDir, farWorld as unknown as vec3, nearWorld as unknown as vec3);
  vec3.normalize(rayDir, rayDir);

  // 2. Orbital plane basis
  const r0 = vec3.length(rayOrigin);

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
  let outcome: TraceResult['outcome'] = 'max_steps';

  // Record initial point
  const wp0: [number, number, number] = [
    r * (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]),
    r * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]),
    r * (Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2]),
  ];
  trajectory.push({ r, phi, worldPos: wp0 });

  const sampleInterval = Math.max(1, Math.floor(maxSteps / 500));

  // 4. RK4 loop (Newtonian — no event horizon termination)
  for (let i = 0; i < maxSteps; i++) {
    const prevPhi = phi;

    const adaptH = stepSize * Math.max(0.15, Math.min(1.0, r / (4.0 * rs + 0.001)));

    [r, phi, vr, vphi] = rk4Step(r, phi, vr, vphi, rs, adaptH);

    totalAngle += Math.abs(phi - prevPhi);

    if (r < closestApproach) closestApproach = r;

    // No event horizon in Newtonian gravity — just guard against singularity
    if (r < 0.01) {
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
      outcome = 'escaped';
      const wp: [number, number, number] = [
        r * (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]),
        r * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]),
        r * (Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2]),
      ];
      trajectory.push({ r, phi, worldPos: wp });
      break;
    }

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
    diskCrossings: 0,
    e1: [e1[0], e1[1], e1[2]],
    e2: [e2[0], e2[1], e2[2]],
  };
}
