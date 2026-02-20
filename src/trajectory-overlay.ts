// src/trajectory-overlay.ts — 3D trajectory overlay on WebGL canvas

import { vec4 } from "gl-matrix";
import type { TraceResult } from "./types";

export class TrajectoryOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private result: TraceResult | null = null;

  constructor() {
    this.canvas = document.getElementById("trajectory-overlay") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
  }

  setResult(result: TraceResult | null): void {
    this.result = result;
    if (!result) this.clear();
  }

  show(): void {
    this.canvas.style.display = "block";
  }

  hide(): void {
    this.canvas.style.display = "none";
    this.clear();
  }

  get visible(): boolean {
    return this.canvas.style.display !== "none";
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(vpMatrix: Float32Array): void {
    if (!this.result || this.result.trajectory.length < 2) return;

    // Resize overlay to match window
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    const traj = this.result.trajectory;
    const projected: { x: number; y: number; behind: boolean }[] = [];

    // Project each world-space point to screen
    for (const pt of traj) {
      const clip = vec4.fromValues(pt.worldPos[0], pt.worldPos[1], pt.worldPos[2], 1.0);
      vec4.transformMat4(clip, clip, vpMatrix as any);

      const behind = clip[3] <= 0;
      const ndcX = clip[0] / Math.abs(clip[3]);
      const ndcY = clip[1] / Math.abs(clip[3]);

      projected.push({
        x: (ndcX * 0.5 + 0.5) * w,
        y: (1.0 - (ndcY * 0.5 + 0.5)) * h,
        behind,
      });
    }

    // Draw glow line (thick, semi-transparent)
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Outer glow
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.3;
    this.drawLine(ctx, projected, traj, true);

    // Inner line
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;
    this.drawLine(ctx, projected, traj, false);

    ctx.globalAlpha = 1.0;
  }

  private drawLine(
    ctx: CanvasRenderingContext2D,
    projected: { x: number; y: number; behind: boolean }[],
    traj: TraceResult['trajectory'],
    isGlow: boolean
  ): void {
    for (let i = 1; i < projected.length; i++) {
      const p0 = projected[i - 1];
      const p1 = projected[i];

      // Skip segments behind camera
      if (p0.behind || p1.behind) continue;

      // Skip very long segments (projection discontinuity)
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      if (dx * dx + dy * dy > 500000) continue;

      const t = i / projected.length;
      let color: string;

      if (isGlow) {
        color = this.result!.outcome === 'absorbed'
          ? `rgba(255, 100, 50, 0.4)`
          : `rgba(0, 200, 255, 0.4)`;
      } else {
        if (this.result!.outcome === 'absorbed') {
          const g = Math.floor(255 * (1 - t));
          color = `rgb(255, ${g}, ${Math.floor(g * 0.5)})`;
        } else {
          const approaching = traj[i].r <= traj[Math.max(0, i - 1)].r;
          if (approaching) {
            color = `rgb(255, ${Math.floor(200 + 55 * (1 - t))}, 100)`;
          } else {
            color = `rgba(0, 220, 255, ${0.5 + 0.5 * (1 - t)})`;
          }
        }
      }

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
}
