// src/controls.ts — UI panel bindings (W3)

import type { BlackHoleParams, OnParamsChangeCallback } from "./types";
import type { Camera } from "./camera";
import {
  DEFAULT_MASS,
  DEFAULT_MAX_STEPS,
  DEFAULT_STEP_SIZE,
} from "./math/constants";

// ── DOM element references ──────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing UI element: #${id}`);
  return e as T;
}

// ── Exported API ────────────────────────────────────────────────────

export function initControls(
  camera: Camera,
  onParamsChange: OnParamsChangeCallback
): void {
  const massSlider = el<HTMLInputElement>("mass-slider");
  const massValue = el<HTMLSpanElement>("mass-value");
  const stepsSlider = el<HTMLInputElement>("steps-slider");
  const stepsValue = el<HTMLSpanElement>("steps-value");
  const stepsizeSlider = el<HTMLInputElement>("stepsize-slider");
  const stepsizeValue = el<HTMLSpanElement>("stepsize-value");
  const toggleDisk = el<HTMLInputElement>("toggle-disk");
  const toggleGrid = el<HTMLInputElement>("toggle-grid");
  const btnReset = el<HTMLButtonElement>("btn-reset");

  // Sync display values on input
  function syncAndNotify(): void {
    massValue.textContent = massSlider.value;
    stepsValue.textContent = stepsSlider.value;
    stepsizeValue.textContent = stepsizeSlider.value;
    onParamsChange(getParams());
  }

  massSlider.addEventListener("input", syncAndNotify);
  stepsSlider.addEventListener("input", syncAndNotify);
  stepsizeSlider.addEventListener("input", syncAndNotify);
  toggleDisk.addEventListener("change", syncAndNotify);
  toggleGrid.addEventListener("change", syncAndNotify);

  btnReset.addEventListener("click", () => {
    camera.reset();
    massSlider.value = String(DEFAULT_MASS);
    stepsSlider.value = String(DEFAULT_MAX_STEPS);
    stepsizeSlider.value = String(DEFAULT_STEP_SIZE);
    toggleDisk.checked = true;
    toggleGrid.checked = false;
    syncAndNotify();
  });

  // H key toggles panel visibility (CSS transition: opacity 0.3s)
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "h" || e.key === "H") {
      const panel = document.getElementById("control-panel");
      if (panel) {
        panel.classList.toggle("hidden");
      }
    }
  });

  // Initialize display values
  massValue.textContent = massSlider.value;
  stepsValue.textContent = stepsSlider.value;
  stepsizeValue.textContent = stepsizeSlider.value;
}

export function getParams(): BlackHoleParams {
  return {
    mass: parseFloat((document.getElementById("mass-slider") as HTMLInputElement).value),
    maxSteps: parseInt((document.getElementById("steps-slider") as HTMLInputElement).value, 10),
    stepSize: parseFloat((document.getElementById("stepsize-slider") as HTMLInputElement).value),
    showDisk: (document.getElementById("toggle-disk") as HTMLInputElement).checked,
    showGrid: (document.getElementById("toggle-grid") as HTMLInputElement).checked,
  };
}

export function getResolutionScale(): number {
  const select = document.getElementById("resolution-select") as HTMLSelectElement | null;
  if (!select) return 1;
  return parseFloat(select.value) || 1;
}

export function updateFPS(fps: number): void {
  const display = document.getElementById("fps-display");
  if (display) {
    display.textContent = `${Math.round(fps)} FPS`;
  }
}
