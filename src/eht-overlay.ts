// src/eht-overlay.ts — EHT observation image comparison overlay

export class EHTOverlay {
  private container: HTMLElement;
  private img: HTMLImageElement;
  private visible = false;

  constructor() {
    this.container = document.getElementById("eht-overlay")!;
    this.img = document.getElementById("eht-image") as HTMLImageElement;

    // Source select
    const sourceSelect = document.getElementById("eht-source-select") as HTMLSelectElement | null;
    if (sourceSelect) {
      sourceSelect.addEventListener("change", () => {
        this.setSource(sourceSelect.value);
      });
    }

    // Opacity slider
    const opacitySlider = document.getElementById("eht-opacity-slider") as HTMLInputElement | null;
    if (opacitySlider) {
      opacitySlider.addEventListener("input", () => {
        this.img.style.opacity = opacitySlider.value;
        const valEl = document.getElementById("eht-opacity-value");
        if (valEl) valEl.textContent = opacitySlider.value;
      });
    }
  }

  private setSource(source: string): void {
    if (source === "m87") {
      this.img.src = "/images/eht-m87.jpg";
      this.img.alt = "EHT M87* Observation";
    } else if (source === "sgra") {
      this.img.src = "/images/eht-sgra.jpg";
      this.img.alt = "EHT Sgr A* Observation";
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? "flex" : "none";
    // Show/hide EHT sub-controls
    const controls = document.getElementById("eht-controls");
    if (controls) controls.style.display = this.visible ? "" : "none";
  }

  show(): void {
    this.visible = true;
    this.container.style.display = "flex";
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = "none";
  }
}
