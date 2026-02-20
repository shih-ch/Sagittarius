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

// Base params that reset everything to a clean state — each step overrides from this
const BASE_PARAMS: Partial<BlackHoleParams> = {
  mass: 1.5, spin: 0,
  showDisk: true, showGrid: false, showDoppler: false, showJets: false,
  showTimeDilation: false, showErgosphere: false,
  showTidalForce: false, showGravWaves: false, showTempMap: false, showPolarization: false,
  bloomIntensity: 0, colorMode: 0,
};

const TOUR_STEPS: TourStep[] = [
  {
    titleZh: "歡迎來到黑洞模擬",
    titleEn: "Welcome to Black Hole Simulation",
    descZh: "這是一個基於廣義相對論的實時黑洞模擬。您將看到黑洞如何彎曲光線、扭曲時空。中央黑色區域是黑洞陰影，周圍明亮的環是被彎曲的吸積盤光。",
    descEn: "This is a real-time black hole simulation based on General Relativity. You'll see how a black hole bends light and warps spacetime. The dark center is the black hole shadow, and the bright ring is light from the accretion disk bent around it.",
    camera: { theta: Math.PI / 3, phi: 0, distance: 30 },
    params: { ...BASE_PARAMS, showDoppler: true },
    holdDuration: 7,
  },
  {
    titleZh: "事件視界",
    titleEn: "Event Horizon",
    descZh: "中央完全漆黑的區域就是事件視界——連光都無法逃脫的邊界。史瓦西半徑 rs = 2M = 3.0。注意盤面在黑洞後方的光也被彎曲到上方形成「帽子」。",
    descEn: "The pitch-black center is the event horizon — the boundary from which not even light can escape. Schwarzschild radius rs = 2M = 3.0. Notice how the disk behind the BH is lensed upward, forming a 'hat' shape.",
    camera: { theta: Math.PI / 2.5, phi: 0, distance: 22 },
    params: { ...BASE_PARAMS, showDoppler: true },
    holdDuration: 7,
  },
  {
    titleZh: "引力透鏡效應",
    titleEn: "Gravitational Lensing",
    descZh: "黑洞彎曲了時空，背景的網格線被劇烈扭曲。越靠近黑洞，彎曲越強烈。在光子球 (r=3M) 附近，光甚至會繞黑洞轉圈，產生明亮的光子環。",
    descEn: "The BH warps spacetime — grid lines are dramatically distorted near it. Closer to the BH, the bending is stronger. Near the photon sphere (r=3M), light orbits the BH, creating bright photon rings.",
    camera: { theta: Math.PI / 3, phi: 0.5, distance: 28 },
    params: { ...BASE_PARAMS, showDisk: false, showGrid: true, maxSteps: 3000 },
    holdDuration: 8,
  },
  {
    titleZh: "吸積盤",
    titleEn: "Accretion Disk",
    descZh: "物質螺旋落入黑洞形成熾熱的吸積盤。內邊緣在 ISCO (6M) 處，溫度超過百萬度。從上方俯視可以清楚看到盤的環形結構和徑向溫度梯度。",
    descEn: "Matter spiraling inward forms a superheated accretion disk. Its inner edge is at the ISCO (6M), with temperatures exceeding millions of degrees. The top-down view clearly shows the ring structure and radial temperature gradient.",
    camera: { theta: 0.4, phi: 0, distance: 30 },
    params: { ...BASE_PARAMS, colorMode: 1 },
    holdDuration: 8,
  },
  {
    titleZh: "都卜勒效應",
    titleEn: "Doppler Beaming",
    descZh: "吸積盤以接近光速旋轉。向我們運動的一側因都卜勒聚束而明亮偏藍（左側），遠離的一側暗淡偏紅（右側）。觀測亮度比可達 I = D⁴·I₀。",
    descEn: "The disk orbits at near-light speed. The approaching side (left) is bright and blue-shifted from Doppler beaming, while the receding side (right) is dim and red-shifted. Brightness ratio: I = D⁴·I₀.",
    camera: { theta: Math.PI / 2.5, phi: 0, distance: 28 },
    params: { ...BASE_PARAMS, showDoppler: true },
    holdDuration: 8,
  },
  {
    titleZh: "克爾黑洞與能層",
    titleEn: "Kerr Black Hole & Ergosphere",
    descZh: "增加自旋到 a=0.9M。旋轉的黑洞拖曳周圍時空，形成「能層」（藍紫色區域）。在能層內，沒有任何物體可以保持靜止。注意盤的內邊緣（ISCO）也因自旋而縮小。",
    descEn: "Spin increased to a=0.9M. The rotating BH drags spacetime, forming the 'ergosphere' (blue-purple). Inside it, nothing can remain stationary. Notice the disk inner edge (ISCO) also shrinks with spin.",
    camera: { theta: Math.PI / 3, phi: 0, distance: 25 },
    params: { ...BASE_PARAMS, spin: 0.9, showDoppler: true, showErgosphere: true },
    holdDuration: 8,
  },
  {
    titleZh: "相對論性噴流",
    titleEn: "Relativistic Jets",
    descZh: "高自旋黑洞通過 Blandford-Znajek 機制沿旋轉軸噴出強大的相對論性噴流。功率正比於 a²。觀察沿上下方向的明亮噴流結構與內部的螺旋磁場。",
    descEn: "High-spin BHs launch powerful relativistic jets along the spin axis via the Blandford-Znajek mechanism. Power scales as a². Observe the bright jet structure above and below with helical magnetic field patterns.",
    camera: { theta: Math.PI / 4, phi: 0, distance: 40 },
    params: { ...BASE_PARAMS, spin: 0.95, showDoppler: true, showJets: true, bloomIntensity: 0.3 },
    holdDuration: 8,
  },
  {
    titleZh: "引力時間膨脹",
    titleEn: "Gravitational Time Dilation",
    descZh: "靠近黑洞的時鐘走得更慢：dτ/dt = √(1 - rs/r)。色圖：綠色=正常時間流速，黃色=變慢，紅色=幾乎凍結。在事件視界處，時間完全停止。",
    descEn: "Clocks slow down near the BH: dτ/dt = √(1 - rs/r). Color map: green=normal flow, yellow=slowed, red=nearly frozen. At the event horizon, time stops completely.",
    camera: { theta: Math.PI / 3, phi: 0, distance: 25 },
    params: { ...BASE_PARAMS, showDoppler: true, showTimeDilation: true },
    holdDuration: 8,
  },
  {
    titleZh: "感謝觀賞！",
    titleEn: "Thank You!",
    descZh: "導覽結束。您可以自由探索：拖動旋轉相機、滾輪縮放、調整右側面板的參數。按 T 追蹤光線軌跡，按 E 查看詳細物理教學。",
    descEn: "Tour complete! Feel free to explore: drag to rotate camera, scroll to zoom, adjust parameters in the right panel. Press T to trace light rays, press E for detailed physics education.",
    camera: { theta: Math.PI / 3, phi: 0, distance: 30 },
    params: { ...BASE_PARAMS, showDoppler: true },
    holdDuration: 6,
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
    this.overlay.style.display = "block";
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
    if (btn) {
      const isZh = document.body.classList.contains("lang-zh");
      btn.textContent = this.autoAdvance ? (isZh ? "暫停" : "Pause") : (isZh ? "自動" : "Auto");
    }
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
