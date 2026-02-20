// src/trajectory-panel.ts — 2D orbital plane diagram for geodesic visualization

import type { TraceResult, BlackHoleParams } from "./types";
import {
  schwarzschildRadius,
  kerrEventHorizon,
  kerrPhotonSphere,
  kerrIsco,
  DISK_OUTER_RATIO,
} from "./math/constants";

export class TrajectoryPanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private info: HTMLElement;
  private panel: HTMLElement;

  constructor() {
    this.panel = document.getElementById("trajectory-panel")!;
    this.canvas = document.getElementById("trajectory-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.info = document.getElementById("trajectory-info")!;
    this.initDrag();
  }

  private initDrag(): void {
    const handle = document.getElementById("trajectory-drag")!;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", (e: MouseEvent) => {
      dragging = true;
      const rect = this.panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      // Switch from bottom/right to top/left positioning
      this.panel.style.left = rect.left + "px";
      this.panel.style.top = rect.top + "px";
      this.panel.style.right = "auto";
      this.panel.style.bottom = "auto";
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e: MouseEvent) => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(window.innerWidth - this.panel.offsetWidth, e.clientX - offsetX));
      const y = Math.max(0, Math.min(window.innerHeight - this.panel.offsetHeight, e.clientY - offsetY));
      this.panel.style.left = x + "px";
      this.panel.style.top = y + "px";
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  show(): void {
    this.panel.classList.remove("hidden");
  }

  hide(): void {
    this.panel.classList.add("hidden");
  }

  get visible(): boolean {
    return !this.panel.classList.contains("hidden");
  }

  render(result: TraceResult, params: BlackHoleParams): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    const mass = params.mass;
    const rs = schwarzschildRadius(mass);
    const rEh = kerrEventHorizon(mass, params.spin);
    const rPh = kerrPhotonSphere(mass, params.spin);
    const rIsco = kerrIsco(mass, params.spin);
    const rOuter = DISK_OUTER_RATIO * rs;

    // Determine scale: fit trajectory + some padding
    let maxR = rOuter;
    for (const pt of result.trajectory) {
      if (pt.r > maxR) maxR = pt.r;
    }
    const scale = (w * 0.42) / maxR;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
    ctx.fillRect(0, 0, w, h);

    // Draw concentric circles
    this.drawCircle(ctx, cx, cy, rOuter * scale, "rgba(255, 136, 0, 0.15)", [4, 4]);
    this.drawCircle(ctx, cx, cy, rIsco * scale, "rgba(255, 136, 0, 0.5)", [6, 4]);
    this.drawCircle(ctx, cx, cy, rPh * scale, "rgba(255, 255, 0, 0.5)", [3, 3]);
    this.drawCircle(ctx, cx, cy, rEh * scale, "rgba(255, 68, 68, 0.8)", []);

    // Fill event horizon
    ctx.beginPath();
    ctx.arc(cx, cy, rEh * scale, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
    ctx.fill();

    // Labels
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#f44";
    ctx.fillText("r_eh", cx + rEh * scale + 3, cy - 3);
    ctx.fillStyle = "#ff0";
    ctx.fillText("r_ph", cx + rPh * scale + 3, cy - 3);
    ctx.fillStyle = "#f80";
    ctx.fillText("ISCO", cx + rIsco * scale + 3, cy - 3);

    // Draw trajectory
    const traj = result.trajectory;
    if (traj.length > 1) {
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < traj.length; i++) {
        const p0 = traj[i - 1];
        const p1 = traj[i];

        // Color based on state: white→yellow→red approaching, cyan escaping
        const t = i / traj.length;
        let color: string;
        if (result.outcome === 'absorbed') {
          // White to red
          const g = Math.floor(255 * (1 - t));
          const b = Math.floor(255 * (1 - t) * (1 - t));
          color = `rgb(255, ${g}, ${b})`;
        } else if (result.outcome === 'escaped' || result.outcome === 'disk_hit') {
          // Cyan for escaping portion
          if (p1.r > p0.r && i > traj.length * 0.3) {
            color = `rgba(0, 220, 255, ${0.5 + 0.5 * (1 - t)})`;
          } else {
            const g = Math.floor(200 + 55 * (1 - t));
            color = `rgb(255, ${g}, 100)`;
          }
        } else {
          color = `rgba(200, 200, 200, ${0.8 - 0.5 * t})`;
        }

        const x0 = cx + p0.r * Math.cos(p0.phi) * scale;
        const y0 = cy - p0.r * Math.sin(p0.phi) * scale;
        const x1 = cx + p1.r * Math.cos(p1.phi) * scale;
        const y1 = cy - p1.r * Math.sin(p1.phi) * scale;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.strokeStyle = color;
        ctx.stroke();
      }

      // Start marker (green)
      const start = traj[0];
      const sx = cx + start.r * Math.cos(start.phi) * scale;
      const sy = cy - start.r * Math.sin(start.phi) * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#0f0";
      ctx.fill();

      // End marker
      const end = traj[traj.length - 1];
      const ex = cx + end.r * Math.cos(end.phi) * scale;
      const ey = cy - end.r * Math.sin(end.phi) * scale;
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fillStyle = result.outcome === 'absorbed' ? "#f00" : "#0ff";
      ctx.fill();

      // Closest approach marker (yellow diamond)
      let closestPt = traj[0];
      for (const pt of traj) {
        if (pt.r < closestPt.r) closestPt = pt;
      }
      const cpx = cx + closestPt.r * Math.cos(closestPt.phi) * scale;
      const cpy = cy - closestPt.r * Math.sin(closestPt.phi) * scale;
      ctx.save();
      ctx.translate(cpx, cpy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#ff0";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }

    // Singularity dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Info text
    const deflDeg = (result.totalDeflection * 180 / Math.PI).toFixed(1);
    const outcomeLabels: Record<string, string> = {
      absorbed: "Absorbed by black hole",
      escaped: "Escaped to infinity",
      disk_hit: "Crossed accretion disk",
      max_steps: "Max steps reached",
    };

    this.info.innerHTML =
      `<b>${outcomeLabels[result.outcome]}</b><br>` +
      `Closest approach: ${result.closestApproach.toFixed(2)} (${(result.closestApproach / rs).toFixed(2)} r<sub>s</sub>)<br>` +
      `Total deflection: ${deflDeg}&deg; (${(result.totalDeflection / Math.PI).toFixed(2)}&pi;)<br>` +
      `Disk crossings: ${result.diskCrossings}<br>` +
      `Points: ${result.trajectory.length}`;
  }

  private drawCircle(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, radius: number,
    color: string, dash: number[]
  ): void {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
