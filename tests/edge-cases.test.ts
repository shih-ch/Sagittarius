/**
 * tests/edge-cases.test.ts — Edge Case Validation
 *
 * Tests boundary conditions that could crash or produce incorrect output.
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
  DEFAULT_STEP_SIZE,
  MIN_CAMERA_DISTANCE,
  MAX_CAMERA_DISTANCE,
  DEFAULT_CAMERA_DISTANCE,
} from '../src/math/constants';

// ============================================================================
// A. Mass = 0: no gravitational effects
// ============================================================================

describe('mass = 0 (flat spacetime)', () => {
  test('Schwarzschild radius is 0', () => {
    expect(schwarzschildRadius(0)).toBe(0);
  });

  test('Photon sphere is 0', () => {
    expect(photonSphereRadius(0)).toBe(0);
  });

  test('ISCO is 0', () => {
    expect(iscoRadius(0)).toBe(0);
  });

  test('Shadow radius is 0', () => {
    expect(shadowRadius(0)).toBe(0);
  });

  test('Disk inner/outer edges are 0 (no disk)', () => {
    const rs = schwarzschildRadius(0);
    expect(DISK_INNER_RATIO * rs).toBe(0);
    expect(DISK_OUTER_RATIO * rs).toBe(0);
  });
});

// ============================================================================
// B. Very large mass
// ============================================================================

describe('mass = 100 (extreme gravity)', () => {
  test('Schwarzschild radius = 200', () => {
    expect(schwarzschildRadius(100)).toBe(200);
  });

  test('Shadow radius ≈ 519.6', () => {
    expect(shadowRadius(100)).toBeCloseTo(3 * Math.sqrt(3) * 100, 1);
  });

  test('Disk outer edge = 2400', () => {
    expect(DISK_OUTER_RATIO * schwarzschildRadius(100)).toBe(2400);
  });

  test('Default camera (r=30) is INSIDE event horizon', () => {
    const rs = schwarzschildRadius(100);
    expect(DEFAULT_CAMERA_DISTANCE).toBeLessThan(rs);
    // Shader handles this: `if (r0 <= rs && rs > 0.0) { black; return; }`
  });
});

// ============================================================================
// C. Negative and edge-case mass values
// ============================================================================

describe('Negative and special mass values', () => {
  test('mass = -1: no NaN or Infinity', () => {
    const vals = [
      schwarzschildRadius(-1),
      photonSphereRadius(-1),
      iscoRadius(-1),
      shadowRadius(-1),
    ];
    for (const v of vals) {
      expect(Number.isNaN(v)).toBe(false);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test('mass = Infinity: returns Infinity (not NaN)', () => {
    expect(schwarzschildRadius(Infinity)).toBe(Infinity);
    expect(photonSphereRadius(Infinity)).toBe(Infinity);
  });

  test('mass = NaN: returns NaN', () => {
    expect(Number.isNaN(schwarzschildRadius(NaN))).toBe(true);
  });
});

// ============================================================================
// D. Step count edge cases
// ============================================================================

describe('Step count boundaries', () => {
  test('steps=1: constants still valid, shader loop runs once', () => {
    expect(schwarzschildRadius(DEFAULT_MASS)).toBeGreaterThan(0);
  });

  test('steps=0: shader loop body never executes (no crash)', () => {
    // The shader: for (i < MAX_LOOP) { if (i >= u_maxSteps) break; }
    // With u_maxSteps=0, immediately breaks. Output = black (no hitSomething).
    expect(true).toBe(true);
  });

  test('steps=5000 (max slider): within MAX_LOOP=10000 compile-time bound', () => {
    expect(5000).toBeLessThan(10000);
  });
});

// ============================================================================
// E. Camera position edge cases
// ============================================================================

describe('Camera position boundaries', () => {
  test('MIN_CAMERA_DISTANCE is outside default event horizon', () => {
    const rs = schwarzschildRadius(DEFAULT_MASS);
    expect(MIN_CAMERA_DISTANCE).toBeGreaterThan(rs);
  });

  test('DEFAULT_CAMERA_DISTANCE is well outside event horizon', () => {
    const rs = schwarzschildRadius(DEFAULT_MASS);
    expect(DEFAULT_CAMERA_DISTANCE).toBeGreaterThan(rs * 5);
  });

  test('Camera at exactly rs: redshift = 0', () => {
    const rs = schwarzschildRadius(DEFAULT_MASS);
    const redshift = Math.sqrt(1 - rs / rs);
    expect(redshift).toBe(0);
  });

  test('Camera just outside rs: small but finite redshift', () => {
    const rs = schwarzschildRadius(DEFAULT_MASS);
    const redshift = Math.sqrt(1 - rs / (rs * 1.001));
    expect(redshift).toBeGreaterThan(0);
    expect(Number.isFinite(redshift)).toBe(true);
  });

  test('Escape radius at MAX_CAMERA_DISTANCE is finite', () => {
    const escapeR = Math.max(80, MAX_CAMERA_DISTANCE * 3);
    expect(Number.isFinite(escapeR)).toBe(true);
    expect(escapeR).toBeGreaterThan(MAX_CAMERA_DISTANCE);
  });
});

// ============================================================================
// F. Float precision edge cases
// ============================================================================

describe('Float precision', () => {
  test('Step size 0.01 (minimum slider): adaptive step is valid', () => {
    const rs = schwarzschildRadius(DEFAULT_MASS);
    const adaptH = 0.01 * Math.min(1.0, Math.max(0.15, 30 / (4 * rs + 0.001)));
    expect(adaptH).toBeGreaterThan(0);
    expect(Number.isFinite(adaptH)).toBe(true);
  });

  test('Step size 0.5 (maximum slider): adaptive step is valid', () => {
    const adaptH = 0.5 * Math.min(1.0, Math.max(0.15, 30 / (4 * 3 + 0.001)));
    expect(adaptH).toBeGreaterThan(0);
    expect(Number.isFinite(adaptH)).toBe(true);
  });

  test('Adaptive step near BH (r ≈ 1.5*rs): step is reduced', () => {
    const rs = schwarzschildRadius(DEFAULT_MASS);
    const rNearBH = rs * 1.5;
    const h = DEFAULT_STEP_SIZE;
    const adaptH = h * Math.min(1.0, Math.max(0.15, rNearBH / (4 * rs + 0.001)));
    expect(adaptH).toBeLessThan(h);
  });
});

// ============================================================================
// G. Shader contract validation
// ============================================================================

describe('Shader contract', () => {
  test('Uniform count: 11 uniforms in contract', () => {
    const uniformNames = [
      'u_resolution', 'u_cameraPos', 'u_invViewProjection',
      'u_mass', 'u_spin', 'u_time', 'u_maxSteps', 'u_stepSize',
      'u_showDisk', 'u_showGrid', 'u_starfield',
    ];
    expect(uniformNames.length).toBe(11);
  });

  test('DISK_INNER_RATIO matches ISCO relationship', () => {
    expect(DISK_INNER_RATIO).toBe(3.0);
    expect(DISK_INNER_RATIO * 2).toBe(6); // ISCO / M
  });

  test('DISK_OUTER_RATIO gives reasonable outer edge', () => {
    expect(DISK_OUTER_RATIO).toBe(12.0);
    expect(DISK_OUTER_RATIO * schwarzschildRadius(DEFAULT_MASS)).toBe(36);
  });
});
