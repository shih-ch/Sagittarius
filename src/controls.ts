// src/controls.ts — UI panel bindings (W3)

import type { BlackHoleParams, OnParamsChangeCallback } from "./types";
import type { Camera } from "./camera";
import {
  DEFAULT_MASS,
  DEFAULT_SPIN,
  DEFAULT_MAX_STEPS,
  DEFAULT_STEP_SIZE,
  kerrEventHorizon,
  kerrPhotonSphere,
  kerrIsco,
  shadowRadius,
  schwarzschildRadius,
} from "./math/constants";

// ── DOM element references ──────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing UI element: #${id}`);
  return e as T;
}

// ── Preset camera views ─────────────────────────────────────────────

const PRESETS: Record<string, { theta: number; phi: number; distance: number }> = {
  top:     { theta: 0.01,              phi: 0, distance: 30 },
  side:    { theta: Math.PI / 2,       phi: 0, distance: 30 },
  classic: { theta: Math.PI / 3,       phi: 0, distance: 30 },
  closeup: { theta: Math.PI / 4,       phi: 0, distance: 10 },
};

// ── Recording state ─────────────────────────────────────────────────

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let isRecording = false;

// ── Exported API ────────────────────────────────────────────────────

export function initControls(
  camera: Camera,
  onParamsChange: OnParamsChangeCallback
): void {
  const massSlider = el<HTMLInputElement>("mass-slider");
  const massValue = el<HTMLSpanElement>("mass-value");
  const spinSlider = el<HTMLInputElement>("spin-slider");
  const spinValue = el<HTMLSpanElement>("spin-value");
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
    spinValue.textContent = spinSlider.value;
    stepsValue.textContent = stepsSlider.value;
    stepsizeValue.textContent = stepsizeSlider.value;
    onParamsChange(getParams());
  }

  massSlider.addEventListener("input", syncAndNotify);
  spinSlider.addEventListener("input", syncAndNotify);
  stepsSlider.addEventListener("input", syncAndNotify);
  stepsizeSlider.addEventListener("input", syncAndNotify);
  toggleDisk.addEventListener("change", syncAndNotify);
  toggleGrid.addEventListener("change", syncAndNotify);

  btnReset.addEventListener("click", () => {
    camera.reset();
    massSlider.value = String(DEFAULT_MASS);
    spinSlider.value = String(DEFAULT_SPIN);
    stepsSlider.value = String(DEFAULT_MAX_STEPS);
    stepsizeSlider.value = String(DEFAULT_STEP_SIZE);
    toggleDisk.checked = true;
    toggleGrid.checked = false;
    syncAndNotify();
  });

  // Preset select
  const presetSelect = document.getElementById("preset-select") as HTMLSelectElement | null;
  if (presetSelect) {
    presetSelect.addEventListener("change", () => {
      const preset = PRESETS[presetSelect.value];
      if (preset) {
        camera.animateTo(preset.theta, preset.phi, preset.distance, 1.0);
      }
    });
  }

  // Screenshot button
  const btnScreenshot = document.getElementById("btn-screenshot");
  if (btnScreenshot) {
    btnScreenshot.addEventListener("click", takeScreenshot);
  }

  // Record button
  const btnRecord = document.getElementById("btn-record");
  if (btnRecord) {
    btnRecord.addEventListener("click", () => toggleRecording(btnRecord));
  }

  // Fullscreen button
  const btnFullscreen = document.getElementById("btn-fullscreen");
  if (btnFullscreen) {
    btnFullscreen.addEventListener("click", toggleFullscreen);
  }

  // Science panel close + language toggle
  const scienceClose = document.getElementById("science-close");
  if (scienceClose) {
    scienceClose.addEventListener("click", () => {
      document.getElementById("science-panel")?.classList.add("hidden");
    });
  }

  const langZh = document.getElementById("lang-zh");
  const langEn = document.getElementById("lang-en");
  if (langZh && langEn) {
    langZh.addEventListener("click", () => {
      document.getElementById("science-zh")!.style.display = "";
      document.getElementById("science-en")!.style.display = "none";
      langZh.classList.add("active");
      langEn.classList.remove("active");
    });
    langEn.addEventListener("click", () => {
      document.getElementById("science-zh")!.style.display = "none";
      document.getElementById("science-en")!.style.display = "";
      langEn.classList.add("active");
      langZh.classList.remove("active");
    });
  }

  // Keyboard shortcuts
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    // Ignore when typing in inputs
    if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;

    switch (e.key.toLowerCase()) {
      case "h":
        document.getElementById("control-panel")?.classList.toggle("hidden");
        break;
      case "i":
        document.getElementById("info-overlay")?.classList.toggle("hidden");
        break;
      case "f":
        toggleFullscreen();
        break;
      case "e":
        document.getElementById("science-panel")?.classList.toggle("hidden");
        break;
      case "s":
        takeScreenshot();
        break;
      case "r": {
        const btn = document.getElementById("btn-record");
        if (btn) toggleRecording(btn);
        break;
      }
    }
  });

  // Initialize display values
  massValue.textContent = massSlider.value;
  spinValue.textContent = spinSlider.value;
  stepsValue.textContent = stepsSlider.value;
  stepsizeValue.textContent = stepsizeSlider.value;
}

export function getParams(): BlackHoleParams {
  return {
    mass: parseFloat((document.getElementById("mass-slider") as HTMLInputElement).value),
    spin: parseFloat((document.getElementById("spin-slider") as HTMLInputElement).value),
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

// ── Info overlay ────────────────────────────────────────────────────

export function updateInfoOverlay(camera: Camera): void {
  const overlay = document.getElementById("info-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return;

  const params = getParams();
  const mass = params.mass;
  const spin = params.spin;

  const rs = schwarzschildRadius(mass);
  const rEh = kerrEventHorizon(mass, spin);
  const rPh = kerrPhotonSphere(mass, spin);
  const rIsco = kerrIsco(mass, spin);
  const rShadow = shadowRadius(mass);

  const theta = camera.getTheta();
  const phi = camera.getPhi();
  const dist = camera.getDistance();

  overlay.innerHTML =
    `<b>Physics</b><br>` +
    `r<sub>s</sub> = ${rs.toFixed(2)} &nbsp; r<sub>eh</sub> = ${rEh.toFixed(2)}<br>` +
    `r<sub>photon</sub> = ${rPh.toFixed(2)} &nbsp; r<sub>isco</sub> = ${rIsco.toFixed(2)}<br>` +
    `r<sub>shadow</sub> = ${rShadow.toFixed(2)}<br>` +
    `spin a/M = ${spin.toFixed(2)}<br>` +
    `<b>Camera</b><br>` +
    `\u03B8 = ${(theta * 180 / Math.PI).toFixed(1)}\u00B0 &nbsp; ` +
    `\u03C6 = ${(phi * 180 / Math.PI).toFixed(1)}\u00B0<br>` +
    `distance = ${dist.toFixed(1)}`;
}

// ── Screenshot ──────────────────────────────────────────────────────

function takeScreenshot(): void {
  const canvas = document.getElementById("gl-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const link = document.createElement("a");
  link.download = `sagittarius-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ── Video recording ─────────────────────────────────────────────────

function toggleRecording(btn: HTMLElement): void {
  if (isRecording) {
    stopRecording(btn);
  } else {
    startRecording(btn);
  }
}

function startRecording(btn: HTMLElement): void {
  const canvas = document.getElementById("gl-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  recordedChunks = [];
  const stream = canvas.captureStream(30);
  mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const link = document.createElement("a");
    link.download = `sagittarius-${Date.now()}.webm`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  mediaRecorder.start();
  isRecording = true;
  btn.textContent = "Stop Rec";
  btn.classList.add("recording");
}

function stopRecording(btn: HTMLElement): void {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  isRecording = false;
  btn.textContent = "Record";
  btn.classList.remove("recording");
}

// ── Fullscreen ──────────────────────────────────────────────────────

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}
