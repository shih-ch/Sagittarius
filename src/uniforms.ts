// src/uniforms.ts — Uniform location cache and batch setter (W2)

import type { UniformLocations, RenderState } from "./types";

const UNIFORM_NAMES: (keyof UniformLocations)[] = [
  "u_resolution",
  "u_cameraPos",
  "u_invViewProjection",
  "u_mass",
  "u_spin",
  "u_time",
  "u_maxSteps",
  "u_stepSize",
  "u_showDisk",
  "u_showGrid",
  "u_showDoppler",
  "u_starfield",
  "u_colorMode",
  "u_showEinsteinRing",
  "u_einsteinRingDir",
  "u_showJets",
  "u_showTimeDilation",
  "u_showErgosphere",
  "u_showTidalForce",
  "u_showGravWaves",
  "u_showTempMap",
  "u_showPolarization",
];

/** Look up and cache all uniform locations for the given program. */
export function getUniformLocations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): UniformLocations {
  const locs = {} as UniformLocations;
  for (const name of UNIFORM_NAMES) {
    locs[name] = gl.getUniformLocation(program, name);
    if (locs[name] === null) {
      console.warn(`Uniform "${name}" not found in shader program`);
    }
  }
  return locs;
}

/** Batch-set every uniform from the current RenderState. */
export function setUniforms(
  gl: WebGL2RenderingContext,
  loc: UniformLocations,
  state: RenderState
): void {
  gl.uniform2f(loc.u_resolution, state.resolution[0], state.resolution[1]);
  gl.uniform3f(
    loc.u_cameraPos,
    state.cameraPos[0],
    state.cameraPos[1],
    state.cameraPos[2]
  );
  gl.uniformMatrix4fv(loc.u_invViewProjection, false, state.invViewProjection);
  gl.uniform1f(loc.u_mass, state.params.mass);
  gl.uniform1f(loc.u_spin, state.params.spin);
  gl.uniform1f(loc.u_time, state.time);
  gl.uniform1i(loc.u_maxSteps, state.params.maxSteps);
  gl.uniform1f(loc.u_stepSize, state.params.stepSize);
  gl.uniform1i(loc.u_showDisk, state.params.showDisk ? 1 : 0);
  gl.uniform1i(loc.u_showGrid, state.params.showGrid ? 1 : 0);
  gl.uniform1i(loc.u_showDoppler, state.params.showDoppler ? 1 : 0);
  gl.uniform1i(loc.u_starfield, 0); // texture unit 0
  gl.uniform1i(loc.u_colorMode, state.params.colorMode);
  gl.uniform1i(loc.u_showEinsteinRing, state.params.showEinsteinRing ? 1 : 0);
  // Convert lon/lat to unit direction vector
  const lon = state.params.einsteinRingLon;
  const lat = state.params.einsteinRingLat;
  gl.uniform3f(
    loc.u_einsteinRingDir,
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon)
  );
  gl.uniform1i(loc.u_showJets, state.params.showJets ? 1 : 0);
  gl.uniform1i(loc.u_showTimeDilation, state.params.showTimeDilation ? 1 : 0);
  gl.uniform1i(loc.u_showErgosphere, state.params.showErgosphere ? 1 : 0);
  gl.uniform1i(loc.u_showTidalForce, state.params.showTidalForce ? 1 : 0);
  gl.uniform1i(loc.u_showGravWaves, state.params.showGravWaves ? 1 : 0);
  gl.uniform1i(loc.u_showTempMap, state.params.showTempMap ? 1 : 0);
  gl.uniform1i(loc.u_showPolarization, state.params.showPolarization ? 1 : 0);
}
