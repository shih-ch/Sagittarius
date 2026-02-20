// src/main.ts — App bootstrap & render loop (Lead)

import type { RenderState, TraceResult, ParticleTraceResult } from "./types";
import {
  DEFAULT_MASS,
  DEFAULT_MAX_STEPS,
  DEFAULT_STEP_SIZE,
  kerrIsco,
} from "./math/constants";
import { createRenderer } from "./renderer";
import { Camera } from "./camera";
import { initControls, getParams, getResolutionScale, updateFPS, updateInfoOverlay } from "./controls";
import { traceGeodesic } from "./geodesic-tracer";
import { traceNewtonGeodesic } from "./newton-tracer";
import { traceParticleOrbit, circularVphi, PARTICLE_PRESETS, tracePenroseProcess } from "./particle-tracer";
import { TrajectoryPanel } from "./trajectory-panel";
import { TrajectoryOverlay } from "./trajectory-overlay";
import { FormulaPanel } from "./formula-panel";
import { EHTOverlay } from "./eht-overlay";
import { GuidedTour } from "./tour";

// Shader sources (Vite ?raw import)
import vertSrc from "./shaders/fullscreen.vert?raw";
import fragSrc from "./shaders/blackhole.frag?raw";
import gridFragSrc from "./shaders/grid.frag?raw";
import bloomExtractSrc from "./shaders/bloom-extract.frag?raw";
import blurSrc from "./shaders/blur.frag?raw";
import compositeSrc from "./shaders/composite.frag?raw";

// ── Bootstrap ────────────────────────────────────────────────────────────────

const canvas = document.getElementById("gl-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #gl-canvas not found");

// Camera (W3)
const camera = new Camera(canvas);

// Controls (W3) — binds sliders/checkboxes, calls back on param change
initControls(camera, (_params) => {
  // params are read each frame via getParams(), nothing to store
});

// Renderer (W2) — now with bloom shader sources
const renderer = createRenderer(canvas, vertSrc, fragSrc, gridFragSrc, bloomExtractSrc, blurSrc, compositeSrc);

// Trajectory visualization (Phase 5)
const trajectoryPanel = new TrajectoryPanel();
const trajectoryOverlay = new TrajectoryOverlay();
let trajectoryMode = false;
let lastTraceResult: TraceResult | null = null;
let newtonCompareEnabled = false;

window.addEventListener("toggle-trajectory-mode", () => {
  trajectoryMode = !trajectoryMode;
  if (trajectoryMode) {
    trajectoryPanel.show();
    trajectoryOverlay.show();
    camera.setPixelClickHandler((evt) => {
      const aspect = window.innerWidth / window.innerHeight;
      const invVP = camera.getInvViewProjectionMatrix(aspect);
      const params = getParams();
      lastTraceResult = traceGeodesic(evt.ndcX, evt.ndcY, invVP, camera.getPosition(), params);

      // Newton comparison
      if (newtonCompareEnabled) {
        const newtonResult = traceNewtonGeodesic(evt.ndcX, evt.ndcY, invVP, camera.getPosition(), params);
        trajectoryPanel.setNewtonResult(newtonResult);
      } else {
        trajectoryPanel.setNewtonResult(null);
      }

      trajectoryPanel.render(lastTraceResult, params);
      trajectoryOverlay.setResult(lastTraceResult);
    });
  } else {
    trajectoryPanel.hide();
    trajectoryOverlay.hide();
    trajectoryOverlay.setResult(null);
    lastTraceResult = null;
    camera.setPixelClickHandler(null);
  }
});

// Formula Panel (Phase 7)
const formulaPanel = new FormulaPanel();

// EHT Comparison Overlay (Phase 7)
const ehtOverlay = new EHTOverlay();
const toggleEhtCheckbox = document.getElementById("toggle-eht-overlay") as HTMLInputElement | null;
if (toggleEhtCheckbox) {
  toggleEhtCheckbox.addEventListener("change", () => {
    if (toggleEhtCheckbox.checked) {
      ehtOverlay.show();
    } else {
      ehtOverlay.hide();
    }
    const controls = document.getElementById("eht-controls");
    if (controls) controls.style.display = toggleEhtCheckbox.checked ? "" : "none";
  });
}

// Guided Tour (Phase 7)
const guidedTour = new GuidedTour(camera, () => {
  // Trigger params change by reading from UI
});

// Tour button
const btnTour = document.getElementById("btn-tour");
if (btnTour) {
  btnTour.addEventListener("click", () => guidedTour.start());
}

// Event-driven tour/formula panel toggles
window.addEventListener("toggle-formula-panel", () => formulaPanel.toggle());
window.addEventListener("start-guided-tour", () => guidedTour.start());

// Newton comparison toggle
const newtonCheckbox = document.getElementById("toggle-newton-compare") as HTMLInputElement | null;
if (newtonCheckbox) {
  newtonCheckbox.addEventListener("change", () => {
    newtonCompareEnabled = newtonCheckbox.checked;
  });
}
window.addEventListener("toggle-newton-compare", () => {
  if (newtonCheckbox) {
    newtonCheckbox.checked = !newtonCheckbox.checked;
    newtonCompareEnabled = newtonCheckbox.checked;
  }
});

// Particle orbit controls
const particlePresetSelect = document.getElementById("particle-preset") as HTMLSelectElement | null;
const particleRadiusSlider = document.getElementById("particle-radius-slider") as HTMLInputElement | null;
const particleVelocitySlider = document.getElementById("particle-velocity-slider") as HTMLInputElement | null;
const particleRadiusValue = document.getElementById("particle-radius-value") as HTMLSpanElement | null;
const particleVelocityValue = document.getElementById("particle-velocity-value") as HTMLSpanElement | null;
const btnTraceParticle = document.getElementById("btn-trace-particle") as HTMLButtonElement | null;

if (particlePresetSelect && particleRadiusSlider && particleVelocitySlider) {
  particlePresetSelect.addEventListener("change", () => {
    const preset = PARTICLE_PRESETS[particlePresetSelect.value];
    if (preset) {
      const params = getParams();
      const mass = params.mass;
      let radius = preset.radius;
      if (radius < 0) {
        // ISCO: use actual Kerr ISCO radius in units of M
        const rIsco = kerrIsco(mass, params.spin);
        radius = mass > 0 ? rIsco / mass : 6;
      }
      particleRadiusSlider.value = String(radius.toFixed(1));
      particleVelocitySlider.value = String(preset.velocityFactor);
      if (particleRadiusValue) particleRadiusValue.textContent = radius.toFixed(1);
      if (particleVelocityValue) particleVelocityValue.textContent = String(preset.velocityFactor);
    }
  });

  particleRadiusSlider.addEventListener("input", () => {
    if (particleRadiusValue) particleRadiusValue.textContent = particleRadiusSlider.value;
    if (particlePresetSelect) particlePresetSelect.value = "custom";
  });

  particleVelocitySlider.addEventListener("input", () => {
    if (particleVelocityValue) particleVelocityValue.textContent = particleVelocitySlider.value;
    if (particlePresetSelect) particlePresetSelect.value = "custom";
  });
}

if (btnTraceParticle) {
  btnTraceParticle.addEventListener("click", () => {
    const params = getParams();
    const radius = particleRadiusSlider ? parseFloat(particleRadiusSlider.value) : 6;
    const velocityFactor = particleVelocitySlider ? parseFloat(particleVelocitySlider.value) : 1.0;

    const particleResult = traceParticleOrbit(params, radius, velocityFactor);
    trajectoryPanel.setParticleResult(particleResult);

    // Re-render panel if we have a light trace
    if (lastTraceResult) {
      trajectoryPanel.render(lastTraceResult, params);
    }
  });
}

// Penrose process button
const btnPenrose = document.getElementById("btn-penrose") as HTMLButtonElement | null;
if (btnPenrose) {
  btnPenrose.addEventListener("click", () => {
    const params = getParams();
    if (params.spin <= 0) {
      alert("Penrose process requires spin > 0");
      return;
    }
    const penroseResult = tracePenroseProcess(params);
    trajectoryPanel.setPenroseResult(penroseResult);
    trajectoryPanel.show();
    // Re-render panel with existing trace result or dummy
    if (lastTraceResult) {
      trajectoryPanel.render(lastTraceResult, params);
    }
  });
}

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

  // Update formula panel with current params
  formulaPanel.update(getParams());

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

  // Update trajectory 3D overlay (follows camera)
  if (trajectoryMode && lastTraceResult && trajectoryOverlay.visible) {
    const vpMatrix = camera.getViewProjectionMatrix(aspect);
    trajectoryOverlay.render(vpMatrix);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
