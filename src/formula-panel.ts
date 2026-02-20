// src/formula-panel.ts — Real-time KaTeX-rendered physics formula panel

import type { BlackHoleParams } from "./types";
import {
  schwarzschildRadius,
  kerrEventHorizon,
  kerrPhotonSphere,
  kerrIsco,
  shadowRadius,
  kerrErgosphere,
} from "./math/constants";

interface FormulaEntry {
  labelZh: string;
  labelEn: string;
  formula: string;
  value: (params: BlackHoleParams) => string;
  condition?: (params: BlackHoleParams) => boolean;
}

const FORMULAS: FormulaEntry[] = [
  {
    labelZh: "史瓦西半徑",
    labelEn: "Schwarzschild Radius",
    formula: "r_s = 2M",
    value: (p) => `= ${schwarzschildRadius(p.mass).toFixed(3)}`,
  },
  {
    labelZh: "事件視界",
    labelEn: "Event Horizon",
    formula: "r_+ = M + \\sqrt{M^2 - a^2}",
    value: (p) => `= ${kerrEventHorizon(p.mass, p.spin).toFixed(3)}`,
  },
  {
    labelZh: "光子球",
    labelEn: "Photon Sphere",
    formula: "r_{ph} = 3M",
    value: (p) => `= ${kerrPhotonSphere(p.mass, p.spin).toFixed(3)}`,
  },
  {
    labelZh: "最內穩定軌道",
    labelEn: "ISCO",
    formula: "r_{isco} = 6M",
    value: (p) => `= ${kerrIsco(p.mass, p.spin).toFixed(3)}`,
  },
  {
    labelZh: "黑洞陰影",
    labelEn: "Shadow Radius",
    formula: "r_{shadow} = 3\\sqrt{3}\\,M",
    value: (p) => `= ${shadowRadius(p.mass).toFixed(3)}`,
  },
  {
    labelZh: "引力紅移",
    labelEn: "Gravitational Redshift",
    formula: "z = \\sqrt{1 - \\frac{r_s}{r}}",
    value: () => "",
  },
  {
    labelZh: "都卜勒因子",
    labelEn: "Doppler Factor",
    formula: "D = \\frac{1}{\\gamma(1 - \\beta\\cos\\theta)}",
    value: () => "",
    condition: (p) => p.showDoppler,
  },
  {
    labelZh: "時間膨脹",
    labelEn: "Time Dilation",
    formula: "\\frac{d\\tau}{dt} = \\sqrt{1 - \\frac{r_s}{r}}",
    value: () => "",
    condition: (p) => p.showTimeDilation,
  },
  {
    labelZh: "能層半徑",
    labelEn: "Ergosphere Radius",
    formula: "r_{ergo} = M + \\sqrt{M^2 - a^2\\cos^2\\theta}",
    value: (p) => {
      const re = kerrErgosphere(p.mass, p.spin, 0); // equatorial
      return `= ${re.toFixed(3)} (eq.)`;
    },
    condition: (p) => p.showErgosphere && p.spin > 0,
  },
];

export class FormulaPanel {
  private panel: HTMLElement;
  private contentEl: HTMLElement;
  private visible = false;
  private katexLoaded = false;
  private katexModule: { renderToString: (tex: string, opts: object) => string } | null = null;

  constructor() {
    this.panel = document.getElementById("formula-panel")!;
    this.contentEl = document.getElementById("formula-content")!;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.classList.toggle("hidden", !this.visible);
    if (this.visible && !this.katexLoaded) {
      this.loadKatex();
    }
  }

  show(): void {
    this.visible = true;
    this.panel.classList.remove("hidden");
    if (!this.katexLoaded) this.loadKatex();
  }

  hide(): void {
    this.visible = false;
    this.panel.classList.add("hidden");
  }

  private async loadKatex(): Promise<void> {
    try {
      const katex = await import("katex");
      this.katexModule = katex.default;
      this.katexLoaded = true;

      // Inject KaTeX CSS
      if (!document.querySelector('link[href*="katex"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
        document.head.appendChild(link);
      }
    } catch {
      // Fallback: render as plain text
      this.katexLoaded = true;
    }
  }

  update(params: BlackHoleParams): void {
    if (!this.visible) return;

    const isZh = document.body.classList.contains("lang-zh");
    let html = "";

    for (const entry of FORMULAS) {
      if (entry.condition && !entry.condition(params)) continue;

      const label = isZh ? entry.labelZh : entry.labelEn;
      const valueStr = entry.value(params);

      let formulaHtml: string;
      if (this.katexModule) {
        try {
          formulaHtml = this.katexModule.renderToString(entry.formula, { throwOnError: false, displayMode: false });
        } catch {
          formulaHtml = `<code>${entry.formula}</code>`;
        }
      } else {
        formulaHtml = `<code>${entry.formula}</code>`;
      }

      html += `<div class="formula-row">
        <span class="formula-label">${label}</span>
        <span class="formula-tex">${formulaHtml}</span>
        ${valueStr ? `<span class="formula-val">${valueStr}</span>` : ""}
      </div>`;
    }

    this.contentEl.innerHTML = html;
  }
}
