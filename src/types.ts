// src/types.ts — Shared interfaces (Lead owns, workers import)

export interface BlackHoleParams {
  mass: number;           // BH mass, geometrized units (default 1.5)
  maxSteps: number;       // Ray march iterations (100–5000)
  stepSize: number;       // RK4 step size (0.01–0.5)
  showDisk: boolean;      // Accretion disk toggle
  showGrid: boolean;      // Spacetime grid mode toggle
}

export interface RenderState {
  resolution: [number, number];
  cameraPos: [number, number, number];
  invViewProjection: Float32Array; // mat4 (16 floats)
  time: number;
  params: BlackHoleParams;
}

export interface UniformLocations {
  u_resolution: WebGLUniformLocation | null;
  u_cameraPos: WebGLUniformLocation | null;
  u_invViewProjection: WebGLUniformLocation | null;
  u_mass: WebGLUniformLocation | null;
  u_time: WebGLUniformLocation | null;
  u_maxSteps: WebGLUniformLocation | null;
  u_stepSize: WebGLUniformLocation | null;
  u_showDisk: WebGLUniformLocation | null;
  u_showGrid: WebGLUniformLocation | null;
  u_starfield: WebGLUniformLocation | null;
}

export interface ICamera {
  getPosition(): [number, number, number];
  getInvViewProjectionMatrix(aspect: number): Float32Array;
  rotate(dTheta: number, dPhi: number): void;
  zoom(delta: number): void;
  reset(): void;
}

export type OnParamsChangeCallback = (params: BlackHoleParams) => void;

export interface Renderer {
  render(state: RenderState): void;
  dispose(): void;
}
