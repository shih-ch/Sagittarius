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
  const toggleDoppler = el<HTMLInputElement>("toggle-doppler");
  const toggleJets = document.getElementById("toggle-jets") as HTMLInputElement | null;
  const colorModeSelect = document.getElementById("colormode-select") as HTMLSelectElement | null;
  const toggleEinsteinRing = document.getElementById("toggle-einstein-ring") as HTMLInputElement | null;
  const einsteinLonSlider = document.getElementById("einstein-lon-slider") as HTMLInputElement | null;
  const einsteinLatSlider = document.getElementById("einstein-lat-slider") as HTMLInputElement | null;
  const einsteinLonValue = document.getElementById("einstein-lon-value") as HTMLSpanElement | null;
  const einsteinLatValue = document.getElementById("einstein-lat-value") as HTMLSpanElement | null;
  const einsteinControls = document.getElementById("einstein-ring-controls") as HTMLElement | null;
  const toggleTimeDilation = document.getElementById("toggle-time-dilation") as HTMLInputElement | null;
  const bloomSlider = document.getElementById("bloom-slider") as HTMLInputElement | null;
  const bloomValue = document.getElementById("bloom-value") as HTMLSpanElement | null;
  const toggleTempLegend = document.getElementById("toggle-temp-legend") as HTMLInputElement | null;
  const toggleErgosphere = document.getElementById("toggle-ergosphere") as HTMLInputElement | null;
  const toggleTidalForce = document.getElementById("toggle-tidal-force") as HTMLInputElement | null;
  const toggleGravWaves = document.getElementById("toggle-grav-waves") as HTMLInputElement | null;
  const toggleTempMap = document.getElementById("toggle-temp-map") as HTMLInputElement | null;
  const togglePolarization = document.getElementById("toggle-polarization") as HTMLInputElement | null;
  const fovSlider = document.getElementById("fov-slider") as HTMLInputElement | null;
  const fovValue = document.getElementById("fov-value") as HTMLSpanElement | null;
  const btnReset = el<HTMLButtonElement>("btn-reset");

  // Sync display values on input
  function syncAndNotify(): void {
    massValue.textContent = massSlider.value;
    spinValue.textContent = spinSlider.value;
    stepsValue.textContent = stepsSlider.value;
    stepsizeValue.textContent = stepsizeSlider.value;
    if (einsteinLonValue && einsteinLonSlider)
      einsteinLonValue.textContent = einsteinLonSlider.value;
    if (einsteinLatValue && einsteinLatSlider)
      einsteinLatValue.textContent = einsteinLatSlider.value;
    if (bloomValue && bloomSlider)
      bloomValue.textContent = bloomSlider.value;
    if (fovValue && fovSlider) {
      fovValue.textContent = fovSlider.value;
      camera.setFov(parseFloat(fovSlider.value));
    }
    // Show/hide Einstein Ring sub-controls
    if (einsteinControls && toggleEinsteinRing)
      einsteinControls.style.display = toggleEinsteinRing.checked ? "" : "none";
    // Show/hide temperature legend
    updateTempLegend();
    onParamsChange(getParams());
  }

  massSlider.addEventListener("input", syncAndNotify);
  spinSlider.addEventListener("input", syncAndNotify);
  stepsSlider.addEventListener("input", syncAndNotify);
  stepsizeSlider.addEventListener("input", syncAndNotify);
  toggleDisk.addEventListener("change", syncAndNotify);
  toggleGrid.addEventListener("change", syncAndNotify);
  toggleDoppler.addEventListener("change", syncAndNotify);
  if (toggleJets) toggleJets.addEventListener("change", syncAndNotify);
  if (colorModeSelect) colorModeSelect.addEventListener("change", syncAndNotify);
  if (fovSlider) fovSlider.addEventListener("input", syncAndNotify);
  // Einstein Ring: auto-align light source behind BH when toggled on
  function alignEinsteinRingToCamera(): void {
    if (!einsteinLonSlider || !einsteinLatSlider) return;
    const theta = camera.getTheta();
    const phi = camera.getPhi();
    // Direction opposite to camera = behind BH
    let lon = phi + Math.PI;
    // Normalize lon to [0, 2*PI]
    lon = ((lon % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const lat = Math.asin(-Math.cos(theta));
    einsteinLonSlider.value = lon.toFixed(2);
    einsteinLatSlider.value = lat.toFixed(2);
  }

  if (toggleEinsteinRing) {
    toggleEinsteinRing.addEventListener("change", () => {
      if (toggleEinsteinRing.checked) {
        alignEinsteinRingToCamera();
      }
      syncAndNotify();
    });
  }

  // Einstein Ring: align button
  const btnAlignEinstein = document.getElementById("btn-align-einstein");
  if (btnAlignEinstein) {
    btnAlignEinstein.addEventListener("click", () => {
      alignEinsteinRingToCamera();
      syncAndNotify();
    });
  }
  if (einsteinLonSlider) einsteinLonSlider.addEventListener("input", syncAndNotify);
  if (einsteinLatSlider) einsteinLatSlider.addEventListener("input", syncAndNotify);
  if (toggleTimeDilation) toggleTimeDilation.addEventListener("change", syncAndNotify);
  if (bloomSlider) bloomSlider.addEventListener("input", syncAndNotify);
  if (toggleTempLegend) toggleTempLegend.addEventListener("change", syncAndNotify);
  if (toggleErgosphere) toggleErgosphere.addEventListener("change", syncAndNotify);
  if (toggleTidalForce) toggleTidalForce.addEventListener("change", syncAndNotify);
  if (toggleGravWaves) toggleGravWaves.addEventListener("change", syncAndNotify);
  if (toggleTempMap) toggleTempMap.addEventListener("change", syncAndNotify);
  if (togglePolarization) togglePolarization.addEventListener("change", syncAndNotify);

  btnReset.addEventListener("click", () => {
    camera.reset();
    massSlider.value = String(DEFAULT_MASS);
    spinSlider.value = String(DEFAULT_SPIN);
    stepsSlider.value = String(DEFAULT_MAX_STEPS);
    stepsizeSlider.value = String(DEFAULT_STEP_SIZE);
    toggleDisk.checked = true;
    toggleGrid.checked = false;
    toggleDoppler.checked = true;
    if (toggleJets) toggleJets.checked = false;
    if (colorModeSelect) colorModeSelect.value = "0";
    if (toggleEinsteinRing) toggleEinsteinRing.checked = false;
    if (einsteinLonSlider) einsteinLonSlider.value = String(Math.PI);
    if (einsteinLatSlider) einsteinLatSlider.value = "0";
    if (toggleTimeDilation) toggleTimeDilation.checked = false;
    if (bloomSlider) bloomSlider.value = "0";
    if (fovSlider) fovSlider.value = "60";
    if (toggleTempLegend) toggleTempLegend.checked = false;
    if (toggleErgosphere) toggleErgosphere.checked = false;
    if (toggleTidalForce) toggleTidalForce.checked = false;
    if (toggleGravWaves) toggleGravWaves.checked = false;
    if (toggleTempMap) toggleTempMap.checked = false;
    if (togglePolarization) togglePolarization.checked = false;
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

  // Panel language toggle (中/EN button for bilingual tips)
  const panelLangToggle = document.getElementById("panel-lang-toggle");
  if (panelLangToggle) {
    panelLangToggle.addEventListener("click", () => {
      const isZh = document.body.classList.contains("lang-zh");
      if (isZh) {
        document.body.classList.remove("lang-zh");
        document.body.classList.add("lang-en");
      } else {
        document.body.classList.remove("lang-en");
        document.body.classList.add("lang-zh");
      }
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
      case "d":
        toggleDoppler.checked = !toggleDoppler.checked;
        syncAndNotify();
        break;
      case "t":
        window.dispatchEvent(new CustomEvent("toggle-trajectory-mode"));
        break;
      case "c":
        if (colorModeSelect) {
          const next = (parseInt(colorModeSelect.value) + 1) % 4;
          colorModeSelect.value = String(next);
          syncAndNotify();
        }
        break;
      case "j":
        if (toggleJets) {
          toggleJets.checked = !toggleJets.checked;
          syncAndNotify();
        }
        break;
      case "b":
        if (bloomSlider) {
          const cur = parseFloat(bloomSlider.value);
          bloomSlider.value = cur > 0 ? "0" : "0.3";
          syncAndNotify();
        }
        break;
      case "n":
        window.dispatchEvent(new CustomEvent("toggle-newton-compare"));
        break;
      case "g":
        if (toggleErgosphere) {
          toggleErgosphere.checked = !toggleErgosphere.checked;
          syncAndNotify();
        }
        break;
      case "w":
        if (toggleGravWaves) {
          toggleGravWaves.checked = !toggleGravWaves.checked;
          syncAndNotify();
        }
        break;
      case "p":
        window.dispatchEvent(new CustomEvent("toggle-formula-panel"));
        break;
      case "o":
        window.dispatchEvent(new CustomEvent("start-guided-tour"));
        break;
    }
  });

  // Initialize display values
  massValue.textContent = massSlider.value;
  spinValue.textContent = spinSlider.value;
  stepsValue.textContent = stepsSlider.value;
  stepsizeValue.textContent = stepsizeSlider.value;
}

export function getParams(): BlackHoleParams {
  const colorModeEl = document.getElementById("colormode-select") as HTMLSelectElement | null;
  const einsteinEl = document.getElementById("toggle-einstein-ring") as HTMLInputElement | null;
  const lonEl = document.getElementById("einstein-lon-slider") as HTMLInputElement | null;
  const latEl = document.getElementById("einstein-lat-slider") as HTMLInputElement | null;
  const jetsEl = document.getElementById("toggle-jets") as HTMLInputElement | null;
  const dilationEl = document.getElementById("toggle-time-dilation") as HTMLInputElement | null;
  const bloomEl = document.getElementById("bloom-slider") as HTMLInputElement | null;
  const ergoEl = document.getElementById("toggle-ergosphere") as HTMLInputElement | null;
  const tidalEl = document.getElementById("toggle-tidal-force") as HTMLInputElement | null;
  const gravWavesEl = document.getElementById("toggle-grav-waves") as HTMLInputElement | null;
  const tempMapEl = document.getElementById("toggle-temp-map") as HTMLInputElement | null;
  const polarizationEl = document.getElementById("toggle-polarization") as HTMLInputElement | null;

  return {
    mass: parseFloat((document.getElementById("mass-slider") as HTMLInputElement).value),
    spin: parseFloat((document.getElementById("spin-slider") as HTMLInputElement).value),
    maxSteps: parseInt((document.getElementById("steps-slider") as HTMLInputElement).value, 10),
    stepSize: parseFloat((document.getElementById("stepsize-slider") as HTMLInputElement).value),
    showDisk: (document.getElementById("toggle-disk") as HTMLInputElement).checked,
    showGrid: (document.getElementById("toggle-grid") as HTMLInputElement).checked,
    showDoppler: (document.getElementById("toggle-doppler") as HTMLInputElement).checked,
    colorMode: colorModeEl ? parseInt(colorModeEl.value, 10) : 0,
    showEinsteinRing: einsteinEl ? einsteinEl.checked : false,
    einsteinRingLon: lonEl ? parseFloat(lonEl.value) : Math.PI,
    einsteinRingLat: latEl ? parseFloat(latEl.value) : 0,
    showJets: jetsEl ? jetsEl.checked : false,
    showTimeDilation: dilationEl ? dilationEl.checked : false,
    bloomIntensity: bloomEl ? parseFloat(bloomEl.value) : 0,
    showErgosphere: ergoEl ? ergoEl.checked : false,
    showTidalForce: tidalEl ? tidalEl.checked : false,
    showGravWaves: gravWavesEl ? gravWavesEl.checked : false,
    showTempMap: tempMapEl ? tempMapEl.checked : false,
    showPolarization: polarizationEl ? polarizationEl.checked : false,
  };
}

/** Programmatically set UI controls from partial params (used by guided tour) */
export function setParamsUI(partial: Partial<BlackHoleParams>): void {
  const setSlider = (id: string, val: number) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = String(val);
  };
  const setCheck = (id: string, val: boolean) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.checked = val;
  };

  if (partial.mass !== undefined) setSlider("mass-slider", partial.mass);
  if (partial.spin !== undefined) setSlider("spin-slider", partial.spin);
  if (partial.maxSteps !== undefined) setSlider("steps-slider", partial.maxSteps);
  if (partial.stepSize !== undefined) setSlider("stepsize-slider", partial.stepSize);
  if (partial.showDisk !== undefined) setCheck("toggle-disk", partial.showDisk);
  if (partial.showGrid !== undefined) setCheck("toggle-grid", partial.showGrid);
  if (partial.showDoppler !== undefined) setCheck("toggle-doppler", partial.showDoppler);
  if (partial.showJets !== undefined) setCheck("toggle-jets", partial.showJets);
  if (partial.showEinsteinRing !== undefined) setCheck("toggle-einstein-ring", partial.showEinsteinRing);
  if (partial.showTimeDilation !== undefined) setCheck("toggle-time-dilation", partial.showTimeDilation);
  if (partial.showErgosphere !== undefined) setCheck("toggle-ergosphere", partial.showErgosphere);
  if (partial.showTidalForce !== undefined) setCheck("toggle-tidal-force", partial.showTidalForce);
  if (partial.showGravWaves !== undefined) setCheck("toggle-grav-waves", partial.showGravWaves);
  if (partial.showTempMap !== undefined) setCheck("toggle-temp-map", partial.showTempMap);
  if (partial.showPolarization !== undefined) setCheck("toggle-polarization", partial.showPolarization);
  if (partial.bloomIntensity !== undefined) setSlider("bloom-slider", partial.bloomIntensity);
  if (partial.colorMode !== undefined) {
    const el = document.getElementById("colormode-select") as HTMLSelectElement | null;
    if (el) el.value = String(partial.colorMode);
  }
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

// ── Accretion Disk Temperature (Novikov-Thorne model) ───────────────
//
// T(r) = T_ref * (M_ref/M)^(1/4) * (r_isco/r)^(3/4) * [1 - sqrt(r_isco/r)]^(1/4)
//
// Reference: 10 M☉ BH at ~10% Eddington accretion rate
// T_peak ≈ 6.3 × 10^6 K (at ~1.36 × r_isco)
// We use M=1.5 (geometrized) as the reference for a 10 M☉ stellar BH.

const T_REF_PEAK = 6.3e6; // K, peak temperature for reference BH
const M_REF = 1.5;        // geometrized mass for reference 10 M☉ BH

function diskTemperature(r: number, mass: number, rIsco: number): number {
  if (r <= rIsco || mass <= 0) return 0;
  // T ∝ M^(-1/4) × (r_isco/r)^(3/4) × [1 - sqrt(r_isco/r)]^(1/4)
  const mScale = Math.pow(M_REF / mass, 0.25);
  const radialProfile = Math.pow(rIsco / r, 0.75) * Math.pow(Math.max(1 - Math.sqrt(rIsco / r), 0), 0.25);
  // Normalize so peak ≈ T_REF_PEAK (peak occurs at r ≈ 1.36 × r_isco)
  // At r=1.36×r_isco: radialProfile ≈ 0.488. We normalize by this.
  return T_REF_PEAK * mScale * radialProfile / 0.488;
}

function formatTemp(t: number): string {
  if (t >= 1e6) return (t / 1e6).toFixed(1) + " MK";
  if (t >= 1e3) return (t / 1e3).toFixed(0) + " kK";
  return t.toFixed(0) + " K";
}

// ── Temperature legend ──────────────────────────────────────────────

function updateTempLegend(): void {
  const legend = document.getElementById("temp-legend");
  const bar = document.getElementById("temp-bar");
  const tempMax = document.getElementById("temp-max");
  const tempMin = document.getElementById("temp-min");
  const tempMid1 = document.getElementById("temp-mid1");
  const tempMid2 = document.getElementById("temp-mid2");
  const tempMid3 = document.getElementById("temp-mid3");
  const toggle = document.getElementById("toggle-temp-legend") as HTMLInputElement | null;
  const diskToggle = document.getElementById("toggle-disk") as HTMLInputElement | null;

  if (!legend || !bar || !tempMax || !tempMin) return;

  const showLegend = toggle?.checked && diskToggle?.checked;
  if (!showLegend) {
    legend.classList.add("hidden");
    return;
  }
  legend.classList.remove("hidden");

  const params = getParams();
  const mass = params.mass;
  const spin = params.spin;
  const rs = schwarzschildRadius(mass);
  const rIsco = kerrIsco(mass, spin);
  const rOuter = 12.0 * rs; // DISK_OUTER_RATIO * rs

  // Peak temperature (at ~1.36 × r_isco)
  const rPeak = 1.36 * rIsco;
  const tPeak = diskTemperature(rPeak, mass, rIsco);
  const tOuter = diskTemperature(rOuter, mass, rIsco);

  tempMax.textContent = formatTemp(tPeak);
  tempMin.textContent = formatTemp(Math.max(tOuter, 100));

  // Intermediate temperatures at 25%, 50%, 75% of radial range
  const rRange = rOuter - rPeak;
  if (tempMid1) tempMid1.textContent = formatTemp(diskTemperature(rPeak + rRange * 0.25, mass, rIsco));
  if (tempMid2) tempMid2.textContent = formatTemp(diskTemperature(rPeak + rRange * 0.50, mass, rIsco));
  if (tempMid3) tempMid3.textContent = formatTemp(diskTemperature(rPeak + rRange * 0.75, mass, rIsco));

  // Generate gradient bar matching the current color mode
  const colorMode = params.colorMode;
  let gradient: string;
  if (colorMode === 1) {
    // Scientific: blue → cyan → yellow → red
    gradient = "linear-gradient(to bottom, #3348ff, #33e6ff, #ffff4d, #cc260d)";
  } else if (colorMode === 2) {
    // Cinematic: warm white → golden → orange → amber
    gradient = "linear-gradient(to bottom, #ffe8cc, #e6b333, #ff8019, #662600)";
  } else if (colorMode === 3) {
    // X-ray: white-blue → blue → dark blue → near-black
    gradient = "linear-gradient(to bottom, #e0f0ff, #6680e6, #2633b3, #080a26)";
  } else {
    // Default thermal: blue-white → yellow → orange → red
    gradient = "linear-gradient(to bottom, #ccccff, #ffd980, #ff8c1f, #990300)";
  }
  bar.style.background = gradient;
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

  // Disk temperatures
  const rPeak = 1.36 * rIsco;
  const rOuter = 12.0 * rs;
  const tPeak = diskTemperature(rPeak, mass, rIsco);
  const tOuter = diskTemperature(rOuter, mass, rIsco);

  overlay.innerHTML =
    `<b>Physics</b><br>` +
    `r<sub>s</sub> = ${rs.toFixed(2)} &nbsp; r<sub>eh</sub> = ${rEh.toFixed(2)}<br>` +
    `r<sub>photon</sub> = ${rPh.toFixed(2)} &nbsp; r<sub>isco</sub> = ${rIsco.toFixed(2)}<br>` +
    `r<sub>shadow</sub> = ${rShadow.toFixed(2)}<br>` +
    `spin a/M = ${spin.toFixed(2)}<br>` +
    (params.showDisk
      ? `<b>Disk Temperature</b><br>` +
        `T<sub>peak</sub> = ${formatTemp(tPeak)} &nbsp; T<sub>outer</sub> = ${formatTemp(Math.max(tOuter, 100))}<br>`
      : "") +
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
