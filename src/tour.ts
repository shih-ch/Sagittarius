// src/tour.ts — Guided educational tour with auto-navigating camera and bilingual narration

import type { BlackHoleParams } from "./types";
import type { Camera } from "./camera";
import { setParamsUI, getParams } from "./controls";

interface TourStep {
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  camera: { theta: number; phi: number; distance: number };
  params: Partial<BlackHoleParams>;
  holdDuration: number; // seconds to hold before auto-advance
}

const TOUR_STEPS: TourStep[] = [
  {
    titleZh: "歡迎來到黑洞模擬",
    titleEn: "Welcome to Black Hole Simulation",
    descZh: "這是一個基於廣義相對論的實時黑洞模擬。我們將帶您探索黑洞的各種物理現象。",
    descEn: "This is a real-time black hole simulation based on General Relativity. Let's explore the physics of black holes together.",
    camera: { theta: Math.PI / 3, phi: 0, distance: 30 },
    params: { mass: 1.5, spin: 0, showDisk: true, showDoppler: true, showJets: false, showTimeDilation: false, showErgosphere: false },
    holdDuration: 6,
  },
  {
    titleZh: "事件視界",
    titleEn: "Event Horizon",
    descZh: "黑色的區域就是事件視界——連光都無法逃脫的邊界。對於不旋轉的黑洞，其半徑為 rs = 2M。",
    descEn: "The dark region is the event horizon — the boundary from which not even light can escape. For a non-spinning BH, its radius is rs = 2M.",
    camera: { theta: Math.PI / 2, phi: 0, distance: 12 },
    params: { mass: 1.5, spin: 0, showDisk: false, showGrid: true },
    holdDuration: 7,
  },
  {
    titleZh: "光子球",
    titleEn: "Photon Sphere",
    descZh: "在 r = 3M 處，光子可以在不穩定的圓形軌道上運行。這是黑洞陰影的邊界。靠近光子球的光線會繞行多圈，形成明亮的光子環。",
    descEn: "At r = 3M, photons can orbit in unstable circular paths. This defines the shadow boundary. Photons passing near the photon sphere loop multiple times, creating bright photon rings.",
    camera: { theta: Math.PI / 4, phi: 0.5, distance: 15 },
    params: { showDisk: false, showGrid: true },
    holdDuration: 8,
  },
  {
    titleZh: "吸積盤",
    titleEn: "Accretion Disk",
    descZh: "物質螺旋落入黑洞時形成熾熱的吸積盤。內邊緣在 ISCO (6M) 處，溫度可達數百萬度。差動旋轉產生可見的螺旋結構。",
    descEn: "Matter spiraling into the BH forms a superheated accretion disk. The inner edge is at the ISCO (6M), with temperatures reaching millions of degrees. Differential rotation creates visible spiral structure.",
    camera: { theta: 0.3, phi: 0, distance: 25 },
    params: { showDisk: true, showGrid: false, showDoppler: false, colorMode: 1 },
    holdDuration: 8,
  },
  {
    titleZh: "引力透鏡效應",
    titleEn: "Gravitational Lensing",
    descZh: "黑洞彎曲了周圍的時空，使背景星光產生扭曲。網格模式清楚地展示了這種效果——注意靠近黑洞的線條如何被劇烈彎曲。",
    descEn: "The BH warps spacetime, distorting background starlight. Grid mode clearly shows this effect — notice how lines near the BH are dramatically bent.",
    camera: { theta: Math.PI / 3, phi: 1.0, distance: 25 },
    params: { showDisk: false, showGrid: true },
    holdDuration: 7,
  },
  {
    titleZh: "都卜勒效應",
    titleEn: "Doppler Effect",
    descZh: "吸積盤以接近光速的速度旋轉。向我們運動的一側因都卜勒聚束而明亮偏藍，遠離的一側暗淡偏紅。這就是 I = D⁴·I₀ 效應。",
    descEn: "The disk orbits at near-light speed. The approaching side appears bright and blue from Doppler beaming, while the receding side is dim and red. This is the I = D⁴·I₀ effect.",
    camera: { theta: Math.PI / 2.5, phi: 0, distance: 20 },
    params: { showDisk: true, showGrid: false, showDoppler: true, colorMode: 0 },
    holdDuration: 8,
  },
  {
    titleZh: "參考系拖曳",
    titleEn: "Frame Dragging",
    descZh: "旋轉的克爾黑洞會拖曳周圍的時空。增加自旋參數後，觀察能層（藍紫色區域）的出現——在這裡，靜止是不可能的。",
    descEn: "A spinning Kerr BH drags spacetime around it. With spin increased, observe the ergosphere (blue-purple region) — here, remaining stationary is impossible.",
    camera: { theta: Math.PI / 3, phi: 0.3, distance: 18 },
    params: { spin: 0.9, showDisk: true, showErgosphere: true, showJets: false },
    holdDuration: 8,
  },
  {
    titleZh: "相對論性噴流",
    titleEn: "Relativistic Jets",
    descZh: "高自旋黑洞通過 Blandford-Znajek 機制產生強大的噴流。功率 ∝ a²，噴流沿自旋軸拋物線聚束，帶有螺旋磁場結構和內部激波節點。",
    descEn: "High-spin BHs power jets via the Blandford-Znajek mechanism. Power ∝ a², jets are parabolically collimated along the spin axis with helical magnetic field structure and internal shock knots.",
    camera: { theta: Math.PI / 4, phi: 0, distance: 35 },
    params: { spin: 0.95, showJets: true, showErgosphere: false, bloomIntensity: 0.3 },
    holdDuration: 8,
  },
  {
    titleZh: "引力時間膨脹",
    titleEn: "Time Dilation",
    descZh: "靠近黑洞的時鐘走得更慢：dτ/dt = √(1 - rs/r)。色圖顯示：綠色=正常時間流速，黃色=變慢，紅色=幾乎凍結，黑色=完全停止。",
    descEn: "Clocks near the BH run slower: dτ/dt = √(1 - rs/r). Color map shows: green=normal, yellow=slowed, red=nearly frozen, black=stopped.",
    camera: { theta: Math.PI / 3, phi: 0, distance: 22 },
    params: { spin: 0, showTimeDilation: true, showJets: false, bloomIntensity: 0, showDisk: true },
    holdDuration: 7,
  },
];

export class GuidedTour {
  private currentStep = 0;
  private running = false;
  private autoAdvance = false;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private camera: Camera;
  private onParamsChange: () => void;

  private overlay: HTMLElement;
  private titleEl: HTMLElement;
  private descEl: HTMLElement;
  private stepIndicator: HTMLElement;

  // Store original params to restore after tour
  private originalParams: BlackHoleParams | null = null;

  constructor(camera: Camera, onParamsChange: () => void) {
    this.camera = camera;
    this.onParamsChange = onParamsChange;

    this.overlay = document.getElementById("tour-overlay")!;
    this.titleEl = document.getElementById("tour-title")!;
    this.descEl = document.getElementById("tour-desc")!;
    this.stepIndicator = document.getElementById("tour-step-indicator")!;

    document.getElementById("tour-prev")?.addEventListener("click", () => this.prev());
    document.getElementById("tour-next")?.addEventListener("click", () => this.next());
    document.getElementById("tour-auto")?.addEventListener("click", () => this.toggleAuto());
    document.getElementById("tour-close")?.addEventListener("click", () => this.stop());
  }

  start(): void {
    this.originalParams = getParams();
    this.currentStep = 0;
    this.running = true;
    this.overlay.style.display = "";
    this.goToStep(0);
  }

  stop(): void {
    this.running = false;
    this.autoAdvance = false;
    this.clearAutoTimer();
    this.overlay.style.display = "none";

    // Restore original params
    if (this.originalParams) {
      setParamsUI(this.originalParams);
      this.onParamsChange();
    }
  }

  next(): void {
    if (this.currentStep < TOUR_STEPS.length - 1) {
      this.goToStep(this.currentStep + 1);
    } else {
      this.stop();
    }
  }

  prev(): void {
    if (this.currentStep > 0) {
      this.goToStep(this.currentStep - 1);
    }
  }

  private toggleAuto(): void {
    this.autoAdvance = !this.autoAdvance;
    const btn = document.getElementById("tour-auto");
    if (btn) btn.textContent = this.autoAdvance ? "Pause" : "Auto";
    if (this.autoAdvance) {
      this.scheduleAutoAdvance();
    } else {
      this.clearAutoTimer();
    }
  }

  private goToStep(index: number): void {
    this.currentStep = index;
    const step = TOUR_STEPS[index];

    const isZh = document.body.classList.contains("lang-zh");
    this.titleEl.textContent = isZh ? step.titleZh : step.titleEn;
    this.descEl.textContent = isZh ? step.descZh : step.descEn;
    this.stepIndicator.textContent = `${index + 1} / ${TOUR_STEPS.length}`;

    // Animate camera
    this.camera.animateTo(step.camera.theta, step.camera.phi, step.camera.distance, 1.5);

    // Set params via UI
    setParamsUI(step.params);
    this.onParamsChange();

    // Auto-advance timer
    this.clearAutoTimer();
    if (this.autoAdvance) {
      this.scheduleAutoAdvance();
    }
  }

  private scheduleAutoAdvance(): void {
    const step = TOUR_STEPS[this.currentStep];
    this.autoTimer = setTimeout(() => {
      if (this.running && this.autoAdvance) {
        this.next();
      }
    }, step.holdDuration * 1000);
  }

  private clearAutoTimer(): void {
    if (this.autoTimer !== null) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }
}
