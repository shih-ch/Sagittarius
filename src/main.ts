// src/main.ts — App bootstrap & render loop (Lead)

import type { RenderState } from "./types";
import {
  DEFAULT_MASS,
  DEFAULT_MAX_STEPS,
  DEFAULT_STEP_SIZE,
} from "./math/constants";
import { createRenderer } from "./renderer";
import { Camera } from "./camera";
import { initControls, getParams, getResolutionScale, updateFPS, updateInfoOverlay } from "./controls";

// Shader sources (Vite ?raw import)
import vertSrc from "./shaders/fullscreen.vert?raw";
import fragSrc from "./shaders/blackhole.frag?raw";
import gridFragSrc from "./shaders/grid.frag?raw";

// ── Bootstrap ────────────────────────────────────────────────────────────────

const canvas = document.getElementById("gl-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #gl-canvas not found");

// Camera (W3)
const camera = new Camera(canvas);

// Controls (W3) — binds sliders/checkboxes, calls back on param change
initControls(camera, (_params) => {
  // params are read each frame via getParams(), nothing to store
});

// Renderer (W2)
const renderer = createRenderer(canvas, vertSrc, fragSrc, gridFragSrc);

// ── FPS tracking ─────────────────────────────────────────────────────────────

let lastTime = performance.now();
let frameCount = 0;
let prevFrameTime = performance.now();

// ── Render Loop ──────────────────────────────────────────────────────────────

function frame(): void {
  const now = performance.now();
  const dt = (now - prevFrameTime) / 1000; // delta time in seconds
  prevFrameTime = now;

  frameCount++;
  if (now - lastTime >= 1000) {
    updateFPS(frameCount / ((now - lastTime) / 1000));
    frameCount = 0;
    lastTime = now;
  }

  // Update camera animation
  camera.update(dt);

  // Update info overlay
  updateInfoOverlay(camera);

  const scale = getResolutionScale();
  const aspect = window.innerWidth / window.innerHeight;
  const params = getParams();

  const state: RenderState = {
    resolution: [
      Math.round(window.innerWidth * scale),
      Math.round(window.innerHeight * scale),
    ],
    cameraPos: camera.getPosition(),
    invViewProjection: camera.getInvViewProjectionMatrix(aspect),
    time: now / 1000,
    params,
  };

  renderer.render(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
