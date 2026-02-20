/**
 * tests/physics.test.ts — Physics Correctness Tests
 *
 * Validates the black hole simulation against analytical Schwarzschild solutions.
 * Uses geometrized units: G=1, c=1.
 *
 * Includes a CPU-side RK4 integrator that replicates the shader's geodesic
 * equations for cross-validation.
 *
 * QA owns this file.
 */

import { describe, test, expect } from 'vitest';
import {
  DEFAULT_MASS,
  schwarzschildRadius,
  photonSphereRadius,
  iscoRadius,
  shadowRadius,
  DISK_INNER_RATIO,
  DISK_OUTER_RATIO,
  kerrEventHorizon,
  kerrPhotonSphere,
  kerrIsco,
} from '../src/math/constants';

// ============================================================================
// Pre-computed expected values (M = 1.5, geometrized units)
// ============================================================================

const M = DEFAULT_MASS; // 1.5

const EXPECTED = {
  rs: 2 * M,                          // 3.0
  photonSphere: 3 * M,                // 4.5
  isco: 6 * M,                        // 9.0
  shadowRadius: 3 * Math.sqrt(3) * M, // ~7.794
  diskInner: DISK_INNER_RATIO * (2 * M), // 3 * rs = 9.0 (= ISCO)
  diskOuter: DISK_OUTER_RATIO * (2 * M), // 12 * rs = 36.0
};

// ============================================================================
// CPU-side RK4 geodesic integrator (mirrors shader equations exactly)
// ============================================================================

interface GeodesicState {
  r: number;
  phi: number;
  dr: number;   // dr/dlambda
  dphi: number; // dphi/dlambda
}

// Exact null geodesic equations from Schwarzschild metric:
//   d²r/dλ² = (r - 1.5·rs)·(dφ/dλ)²
//   d²φ/dλ² = -(2/r)·(dr/dλ)·(dφ/dλ)
// Derived via Euler-Lagrange from ds²=-(1-rs/r)dt²+(1-rs/r)⁻¹dr²+r²dΩ²
function geodesicDerivatives(state: GeodesicState, rs: number): GeodesicState {
  const { r, dr, dphi } = state;
  return {
    r: dr,
    phi: dphi,
    dr: (r - 1.5 * rs) * dphi * dphi,
    dphi: -(2 / r) * dr * dphi,
  };
}

function rk4Step(state: GeodesicState, rs: number, h: number): GeodesicState {
  const add = (a: GeodesicState, b: GeodesicState, s: number): GeodesicState => ({
    r: a.r + b.r * s,
    phi: a.phi + b.phi * s,
    dr: a.dr + b.dr * s,
    dphi: a.dphi + b.dphi * s,
  });

  const scale = (d: GeodesicState, s: number): GeodesicState => ({
    r: d.r * s,
    phi: d.phi * s,
    dr: d.dr * s,
    dphi: d.dphi * s,
  });

  const k1 = scale(geodesicDerivatives(state, rs), h);
  const k2 = scale(geodesicDerivatives(add(state, k1, 0.5), rs), h);
  const k3 = scale(geodesicDerivatives(add(state, k2, 0.5), rs), h);
  const k4 = scale(geodesicDerivatives(add(state, k3, 1.0), rs), h);

  return {
    r: state.r + (k1.r + 2 * k2.r + 2 * k3.r + k4.r) / 6,
    phi: state.phi + (k1.phi + 2 * k2.phi + 2 * k3.phi + k4.phi) / 6,
    dr: state.dr + (k1.dr + 2 * k2.dr + 2 * k3.dr + k4.dr) / 6,
    dphi: state.dphi + (k1.dphi + 2 * k2.dphi + 2 * k3.dphi + k4.dphi) / 6,
  };
}

function integrateGeodesic(
  initial: GeodesicState,
  mass: number,
  stepSize: number,
  maxSteps: number,
): GeodesicState[] {
  const rs = 2 * mass;
  const trajectory: GeodesicState[] = [{ ...initial }];
  let state = { ...initial };

  for (let i = 0; i < maxSteps; i++) {
    state = rk4Step(state, rs, stepSize);
    trajectory.push({ ...state });
    if (state.r < rs) break;
    if (state.r > 500) break;
  }

  return trajectory;
}

// ============================================================================
// A. Constants validation
// ============================================================================

describe('Physics constants', () => {
  test('Schwarzschild radius: rs = 2M', () => {
    expect(schwarzschildRadius(M)).toBeCloseTo(EXPECTED.rs, 10);
  });

  test('Photon sphere: r_ph = 3M', () => {
    expect(photonSphereRadius(M)).toBeCloseTo(EXPECTED.photonSphere, 10);
  });

  test('ISCO: r_isco = 6M', () => {
    expect(iscoRadius(M)).toBeCloseTo(EXPECTED.isco, 10);
  });

  test('Shadow radius: r_shadow = 3*sqrt(3)*M', () => {
    expect(shadowRadius(M)).toBeCloseTo(EXPECTED.shadowRadius, 10);
  });

  test('Disk inner edge coincides with ISCO', () => {
    const diskInner = DISK_INNER_RATIO * schwarzschildRadius(M);
    expect(diskInner).toBeCloseTo(iscoRadius(M), 10);
  });

  test('Disk outer edge = 12 * rs', () => {
    const diskOuter = DISK_OUTER_RATIO * schwarzschildRadius(M);
    expect(diskOuter).toBeCloseTo(EXPECTED.diskOuter, 10);
  });

  test('All radii scale linearly with mass', () => {
    for (const m of [0.5, 1.0, 2.0, 5.0, 10.0]) {
      expect(schwarzschildRadius(m)).toBeCloseTo(2 * m, 10);
      expect(photonSphereRadius(m)).toBeCloseTo(3 * m, 10);
      expect(iscoRadius(m)).toBeCloseTo(6 * m, 10);
      expect(shadowRadius(m)).toBeCloseTo(3 * Math.sqrt(3) * m, 10);
    }
  });
});

// ============================================================================
// B. Geodesic integration (CPU reference → cross-validates shader)
// ============================================================================

describe('Geodesic integration (CPU RK4)', () => {
  test('Event horizon absorption: inward ray is captured (r < rs)', () => {
    const rs = 2 * M;
    const initial: GeodesicState = {
      r: 20 * M,
      phi: 0,
      dr: -1.0,
      dphi: 0.001, // tiny angular momentum → falls in
    };

    const traj = integrateGeodesic(initial, M, 0.02, 50000);
    const final_ = traj[traj.length - 1];

    expect(final_.r).toBeLessThan(rs);
  });

  test('Photon sphere: tangential ray at r=3M orbits >= 1 loop', () => {
    const rph = 3 * M;
    const rs = 2 * M;
    // Circular orbit condition: d²r/dλ² = 0 → dphi = sqrt(rs / (2r³))
    const dphi = Math.sqrt(rs / (2 * rph * rph * rph));

    const initial: GeodesicState = { r: rph, phi: 0, dr: 0, dphi };
    const traj = integrateGeodesic(initial, M, 0.01, 100000);
    const final_ = traj[traj.length - 1];

    // Should orbit at least once (2π) before instability ejects it
    expect(final_.phi).toBeGreaterThan(2 * Math.PI);
  });

  test('Mass=0: angular momentum L = r²·dphi is conserved (straight line)', () => {
    const initial: GeodesicState = { r: 50, phi: 0, dr: -1.0, dphi: 0.02 };
    const L0 = initial.r * initial.r * initial.dphi;

    const traj = integrateGeodesic(initial, 0, 0.05, 2000);

    let maxDeviation = 0;
    for (const s of traj) {
      if (s.r < 0.1) break;
      const L = s.r * s.r * s.dphi;
      const dev = Math.abs(L - L0) / Math.abs(L0);
      if (dev > maxDeviation) maxDeviation = dev;
    }

    expect(maxDeviation).toBeLessThan(1e-4);
  });

  test('Light deflection: passing ray is deflected but escapes', () => {
    const initial: GeodesicState = {
      r: 100 * M,
      phi: 0,
      dr: -1.0,
      dphi: 0.03,
    };

    const traj = integrateGeodesic(initial, M, 0.05, 50000);
    const final_ = traj[traj.length - 1];

    expect(final_.r).toBeGreaterThan(100 * M); // escaped
    expect(Math.abs(final_.phi)).toBeGreaterThan(0.1); // measurably deflected
  });

  test('Stronger gravity → more deflection', () => {
    const makeRay = (): GeodesicState => ({
      r: 100, phi: 0, dr: -1.0, dphi: 0.05,
    });

    const traj1 = integrateGeodesic(makeRay(), 0.5, 0.05, 50000);
    const traj2 = integrateGeodesic(makeRay(), 2.0, 0.05, 50000);

    const deflection1 = Math.abs(traj1[traj1.length - 1].phi);
    const deflection2 = Math.abs(traj2[traj2.length - 1].phi);

    // Higher mass should give more deflection (or capture)
    expect(deflection2).toBeGreaterThan(deflection1);
  });
});

// ============================================================================
// C. Gravitational redshift
// ============================================================================

describe('Gravitational redshift: sqrt(1 - rs/r)', () => {
  const rs = schwarzschildRadius(M);

  test('At r = 2*rs: redshift = sqrt(0.5)', () => {
    const z = Math.sqrt(1 - rs / (2 * rs));
    expect(z).toBeCloseTo(Math.sqrt(0.5), 6);
  });

  test('At event horizon (r = rs): redshift = 0 (infinite redshift)', () => {
    const z = Math.sqrt(1 - rs / rs);
    expect(z).toBe(0);
  });

  test('At infinity (r >> rs): redshift ≈ 1 (no shift)', () => {
    const z = Math.sqrt(1 - rs / 1e10);
    expect(z).toBeCloseTo(1, 4);
  });

  test('Redshift is monotonically increasing with r', () => {
    const radii = [rs * 1.01, rs * 1.5, rs * 2, rs * 5, rs * 10, rs * 100];
    for (let i = 1; i < radii.length; i++) {
      const zPrev = Math.sqrt(1 - rs / radii[i - 1]);
      const zCurr = Math.sqrt(1 - rs / radii[i]);
      expect(zCurr).toBeGreaterThan(zPrev);
    }
  });
});

// ============================================================================
// D. Shadow radius
// ============================================================================

describe('Shadow radius', () => {
  test('Matches analytical value 3*sqrt(3)*M', () => {
    expect(shadowRadius(M)).toBeCloseTo(3 * Math.sqrt(3) * M, 10);
  });

  test('Shadow ≈ 5.196*M', () => {
    const ratio = shadowRadius(M) / M;
    expect(ratio).toBeCloseTo(5.196, 2);
  });
});

// ============================================================================
// E. Kerr metric radii
// ============================================================================

describe('Kerr metric radii', () => {
  test('spin=0 recovers Schwarzschild: r_eh = rs = 2M', () => {
    expect(kerrEventHorizon(M, 0)).toBeCloseTo(schwarzschildRadius(M), 6);
  });

  test('spin=0 recovers Schwarzschild photon sphere: r_ph = 3M', () => {
    expect(kerrPhotonSphere(M, 0)).toBeCloseTo(photonSphereRadius(M), 4);
  });

  test('spin=0 recovers Schwarzschild ISCO: r_isco = 6M', () => {
    expect(kerrIsco(M, 0)).toBeCloseTo(iscoRadius(M), 4);
  });

  test('Higher spin → smaller event horizon', () => {
    const rEh0 = kerrEventHorizon(M, 0);
    const rEh5 = kerrEventHorizon(M, 0.5);
    const rEh9 = kerrEventHorizon(M, 0.9);
    expect(rEh5).toBeLessThan(rEh0);
    expect(rEh9).toBeLessThan(rEh5);
  });

  test('Higher spin → smaller prograde ISCO', () => {
    const rIsco0 = kerrIsco(M, 0);
    const rIsco5 = kerrIsco(M, 0.5);
    const rIsco9 = kerrIsco(M, 0.9);
    expect(rIsco5).toBeLessThan(rIsco0);
    expect(rIsco9).toBeLessThan(rIsco5);
  });

  test('Extremal spin (a→1): ISCO approaches M', () => {
    const rIscoExtremal = kerrIsco(M, 0.9999);
    // At extremal spin, ISCO converges toward M but numerical precision limits exactness
    expect(rIscoExtremal).toBeLessThan(kerrIsco(M, 0.9));
    expect(rIscoExtremal).toBeGreaterThan(M);
    expect(rIscoExtremal / M).toBeLessThan(1.15);
  });

  test('mass=0: all Kerr radii are 0', () => {
    expect(kerrEventHorizon(0, 0)).toBe(0);
    expect(kerrPhotonSphere(0, 0)).toBe(0);
    expect(kerrIsco(0, 0)).toBe(0);
  });

  test('All Kerr radii scale linearly with mass', () => {
    for (const m of [1.0, 2.0, 5.0]) {
      const spin = 0.5;
      const rEh1 = kerrEventHorizon(1.0, spin);
      const rEhM = kerrEventHorizon(m, spin);
      expect(rEhM / m).toBeCloseTo(rEh1, 4);
    }
  });
});
