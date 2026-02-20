// src/math/constants.ts — Physics constants (geometrized: G=1, c=1)

export const DEFAULT_MASS = 1.5;
export const DEFAULT_SPIN = 0;
export const DEFAULT_MAX_STEPS = 1000;
export const DEFAULT_STEP_SIZE = 0.05;

export const schwarzschildRadius = (mass: number) => 2.0 * mass;
export const photonSphereRadius = (mass: number) => 3.0 * mass;
export const iscoRadius = (mass: number) => 6.0 * mass;

// Kerr metric radii (equatorial, prograde)
// Event horizon: r_+ = M + sqrt(M² - a²)
export const kerrEventHorizon = (mass: number, spin: number): number => {
  const a = spin * mass; // dimensional spin
  return mass + Math.sqrt(Math.max(mass * mass - a * a, 0));
};

// Prograde photon orbit: r_ph = 2M(1 + cos(2/3 * arccos(-a/M)))
export const kerrPhotonSphere = (mass: number, spin: number): number => {
  if (mass === 0) return 0;
  const a = Math.min(Math.abs(spin), 0.9999);
  return 2 * mass * (1 + Math.cos((2 / 3) * Math.acos(-a)));
};

// Prograde ISCO
export const kerrIsco = (mass: number, spin: number): number => {
  if (mass === 0) return 0;
  const a = Math.min(Math.abs(spin), 0.9999);
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return mass * (3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2)));
};

// Disk geometry
export const DISK_INNER_RATIO = 3.0;   // inner edge = 3 × rs = ISCO
export const DISK_OUTER_RATIO = 12.0;  // outer edge = 12 × rs

// Camera defaults
export const DEFAULT_CAMERA_DISTANCE = 30.0;
export const DEFAULT_CAMERA_THETA = Math.PI / 3;
export const DEFAULT_CAMERA_PHI = 0;
export const DEFAULT_FOV = 60.0;
export const MIN_CAMERA_DISTANCE = 5.0;
export const MAX_CAMERA_DISTANCE = 200.0;

// Shadow radius (analytical): r_shadow = 3√3 × M ≈ 5.196 × M
export const shadowRadius = (mass: number) => 3 * Math.sqrt(3) * mass;
