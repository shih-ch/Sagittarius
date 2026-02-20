// src/math/constants.ts — Physics constants (geometrized: G=1, c=1)

export const DEFAULT_MASS = 1.5;
export const DEFAULT_MAX_STEPS = 1000;
export const DEFAULT_STEP_SIZE = 0.05;

export const schwarzschildRadius = (mass: number) => 2.0 * mass;
export const photonSphereRadius = (mass: number) => 3.0 * mass;
export const iscoRadius = (mass: number) => 6.0 * mass;

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
