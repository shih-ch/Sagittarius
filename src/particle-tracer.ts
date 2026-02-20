// src/particle-tracer.ts — Timelike geodesic tracer for massive particle orbits

import type { TrajectoryPoint, ParticleTraceResult, PenroseResult, BlackHoleParams } from "./types";
import { schwarzschildRadius, kerrEventHorizon, kerrIsco, kerrErgosphere } from "./math/constants";

const MAX_STEPS = 20000;

// Timelike geodesic derivatives for massive particles (Schwarzschild)
// Same GR correction as null geodesics, but with effective potential for massive particles
function particleDerivs(
  r: number, _phi: number, vr: number, vphi: number,
  rs: number, a: number = 0
): [number, number, number, number] {
  const rSafe = Math.max(r, 0.001);

  // Massive particle in Schwarzschild:
  //   d²r/dτ² = -rs/(2r²) + (r - 1.5rs)·vphi²
  //   d²φ/dτ² = -(2/r)·vr·vphi
  let d2r = -rs / (2.0 * rSafe * rSafe) + (rSafe - 1.5 * rs) * vphi * vphi;
  let d2phi = -(2.0 / rSafe) * vr * vphi;

  // Kerr frame-dragging corrections (equatorial approximation)
  if (a !== 0) {
    const r3 = rSafe * rSafe * rSafe;
    d2r += -a * a * rs / (2.0 * r3) + a * rs * vphi / (rSafe * rSafe);
    d2phi += a * rs * vr / r3;
  }

  return [vr, vphi, d2r, d2phi];
}

function rk4Step(
  r: number, phi: number, vr: number, vphi: number,
  rs: number, h: number, a: number = 0
): [number, number, number, number] {
  const k1 = particleDerivs(r, phi, vr, vphi, rs, a);
  const k2 = particleDerivs(
    r + k1[0] * h * 0.5, phi + k1[1] * h * 0.5,
    vr + k1[2] * h * 0.5, vphi + k1[3] * h * 0.5, rs, a
  );
  const k3 = particleDerivs(
    r + k2[0] * h * 0.5, phi + k2[1] * h * 0.5,
    vr + k2[2] * h * 0.5, vphi + k2[3] * h * 0.5, rs, a
  );
  const k4 = particleDerivs(
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

// Circular orbit angular velocity: vphi = sqrt(M / (r²(r - 1.5rs)))
export function circularVphi(mass: number, r: number): number {
  const rs = 2.0 * mass;
  const denom = r * r * (r - 1.5 * rs);
  if (denom <= 0) return 0;
  return Math.sqrt(mass / denom);
}

export interface ParticlePreset {
  name: string;
  radius: number; // in units of M
  velocityFactor: number; // multiplier on circular velocity
}

export const PARTICLE_PRESETS: Record<string, ParticlePreset> = {
  stable: { name: "Circular (10M)", radius: 10, velocityFactor: 1.0 },
  isco: { name: "Circular @ ISCO", radius: -1, velocityFactor: 1.0 }, // -1 = use ISCO
  elliptical: { name: "Elliptical (10M)", radius: 10, velocityFactor: 0.95 },
  plunging: { name: "Plunging (4M)", radius: 4, velocityFactor: 0.5 },
};

export function traceParticleOrbit(
  params: BlackHoleParams,
  radiusM: number, // radius in units of mass
  velocityFactor: number // multiplier on circular velocity
): ParticleTraceResult {
  const mass = params.mass;
  const rs = schwarzschildRadius(mass);
  const r_eh = kerrEventHorizon(mass, params.spin);

  const r0 = radiusM * mass;
  const vphi0 = circularVphi(mass, r0) * velocityFactor;

  let r = r0;
  let phi = 0;
  let vr = 0; // start with zero radial velocity (tangential orbit)
  let vphi = vphi0;

  const h = params.stepSize * 0.5; // smaller steps for particle orbits
  const trajectory: TrajectoryPoint[] = [];
  let closestApproach = r;
  let farthestExtent = r;
  let totalAngle = 0;
  let outcome: ParticleTraceResult['outcome'] = 'max_steps';

  // Initial point (in equatorial plane: e1 = x-axis, e2 = z-axis)
  trajectory.push({
    r, phi,
    worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)],
  });

  const sampleInterval = Math.max(1, Math.floor(MAX_STEPS / 1000));

  for (let i = 0; i < MAX_STEPS; i++) {
    const prevPhi = phi;

    const adaptH = h * Math.max(0.15, Math.min(1.0, r / (4.0 * rs + 0.001)));
    [r, phi, vr, vphi] = rk4Step(r, phi, vr, vphi, rs, adaptH);

    totalAngle += Math.abs(phi - prevPhi);

    if (r < closestApproach) closestApproach = r;
    if (r > farthestExtent) farthestExtent = r;

    // Check event horizon
    if (r <= r_eh) {
      outcome = 'plunging';
      trajectory.push({
        r, phi,
        worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)],
      });
      break;
    }

    // Check if orbit escaped too far
    if (r > 50 * mass) {
      outcome = 'elliptical';
      trajectory.push({
        r, phi,
        worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)],
      });
      break;
    }

    if (i % sampleInterval === 0) {
      trajectory.push({
        r, phi,
        worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)],
      });
    }
  }

  // Determine outcome based on orbit behavior
  const orbitCount = totalAngle / (2 * Math.PI);
  if (outcome === 'max_steps') {
    const rVariation = (farthestExtent - closestApproach) / r0;
    if (rVariation < 0.05) {
      outcome = 'circular';
    } else {
      outcome = 'elliptical';
    }
  }

  return {
    trajectory,
    outcome,
    orbitCount,
    closestApproach,
    farthestExtent,
    initialRadius: r0,
    initialVphi: vphi0,
  };
}

// ── Penrose Process ─────────────────────────────────────────────────

// Energy at infinity for a particle in Kerr spacetime (equatorial, geometrized)
// E = (1 - rs/r) · vt + (a·rs/r) · vphi
// For simplicity, vt ≈ 1 (normalized) so E ≈ (1 - rs/r) + (a·rs/r) · vphi
function kerrEnergy(r: number, vr: number, vphi: number, rs: number, a: number): number {
  const rSafe = Math.max(r, rs + 0.01);
  return (1.0 - rs / rSafe) + (a * rs / rSafe) * vphi;
}

function traceFragment(
  r0: number, phi0: number, vr0: number, vphi0: number,
  rs: number, a: number, h: number, maxSteps: number, rEh: number
): TrajectoryPoint[] {
  const traj: TrajectoryPoint[] = [];
  let r = r0, phi = phi0, vr = vr0, vphi = vphi0;
  const sampleInterval = Math.max(1, Math.floor(maxSteps / 500));

  traj.push({ r, phi, worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)] });

  for (let i = 0; i < maxSteps; i++) {
    const adaptH = h * Math.max(0.15, Math.min(1.0, r / (4.0 * rs + 0.001)));
    [r, phi, vr, vphi] = rk4Step(r, phi, vr, vphi, rs, adaptH, a);

    if (r <= rEh) {
      traj.push({ r, phi, worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)] });
      break;
    }
    if (r > 50 * (rs / 2)) {
      traj.push({ r, phi, worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)] });
      break;
    }
    if (i % sampleInterval === 0) {
      traj.push({ r, phi, worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)] });
    }
  }
  return traj;
}

export function tracePenroseProcess(params: BlackHoleParams, inboundRadiusM: number = 8): PenroseResult {
  const mass = params.mass;
  const spin = Math.max(params.spin, 0.3); // Need spin for ergosphere
  const rs = schwarzschildRadius(mass);
  const a = spin * mass;
  const rEh = kerrEventHorizon(mass, spin);
  const rErgoEq = kerrErgosphere(mass, spin, 0); // equatorial ergosphere

  const r0 = inboundRadiusM * mass;
  const h = params.stepSize * 0.3;
  const maxSteps = 10000;

  // 1. Trace inbound particle toward BH (radial infall with small prograde angular momentum)
  let r = r0, phi = 0;
  let vr = -0.3; // inward radial velocity
  let vphi = circularVphi(mass, r0) * 0.3; // small prograde angular momentum
  const inbound: TrajectoryPoint[] = [];
  const sampleInterval = Math.max(1, Math.floor(maxSteps / 500));

  inbound.push({ r, phi, worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)] });

  let splitR = 0, splitPhi = 0, splitVr = 0, splitVphi = 0;
  let foundSplit = false;

  for (let i = 0; i < maxSteps; i++) {
    const adaptH = h * Math.max(0.15, Math.min(1.0, r / (4.0 * rs + 0.001)));
    [r, phi, vr, vphi] = rk4Step(r, phi, vr, vphi, rs, adaptH, a);

    if (i % sampleInterval === 0) {
      inbound.push({ r, phi, worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)] });
    }

    // Split when inside ergosphere but outside event horizon
    if (!foundSplit && r < rErgoEq && r > rEh * 1.1) {
      foundSplit = true;
      splitR = r;
      splitPhi = phi;
      splitVr = vr;
      splitVphi = vphi;
      inbound.push({ r, phi, worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)] });
      break;
    }

    if (r <= rEh) {
      inbound.push({ r, phi, worldPos: [r * Math.cos(phi), 0, r * Math.sin(phi)] });
      break;
    }
  }

  // If we couldn't find a split point inside ergosphere, use a fallback
  if (!foundSplit) {
    splitR = rErgoEq * 0.9;
    splitPhi = phi;
    splitVr = vr;
    splitVphi = vphi;
  }

  // 2. Calculate energies and split
  const energyIn = kerrEnergy(splitR, splitVr, splitVphi, rs, a);

  // Fragment A: retrograde (negative energy at infinity) — plunges into BH
  // Give it strong retrograde angular momentum to achieve negative energy
  const vphiA = -Math.abs(splitVphi) * 3.0; // retrograde
  const vrA = splitVr - 0.1; // slightly more inward

  // Fragment B: prograde (boosted energy) — escapes
  // By momentum conservation: vphiB = 2·splitVphi - vphiA (simplified)
  const vphiB = 2.0 * splitVphi - vphiA;
  const vrB = -splitVr + 0.2; // outward

  const energyA = kerrEnergy(splitR, vrA, vphiA, rs, a);
  const energyB = kerrEnergy(splitR, vrB, vphiB, rs, a);

  // 3. Trace fragments
  const fragmentA = traceFragment(splitR, splitPhi, vrA, vphiA, rs, a, h, maxSteps, rEh);
  const fragmentB = traceFragment(splitR, splitPhi, vrB, vphiB, rs, a, h, maxSteps, rEh);

  return {
    inbound,
    fragmentA,
    fragmentB,
    energyIn,
    energyA,
    energyB,
    splitRadius: splitR,
  };
}
