// src/trajectory-panel.ts — 2D orbital plane diagram for geodesic visualization

import type { TraceResult, ParticleTraceResult, PenroseResult, BlackHoleParams } from "./types";
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
  private newtonResult: TraceResult | null = null;
  private particleResult: ParticleTraceResult | null = null;
  private penroseResult: PenroseResult | null = null;

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

  setNewtonResult(result: TraceResult | null): void {
    this.newtonResult = result;
  }

  setParticleResult(result: ParticleTraceResult | null): void {
    this.particleResult = result;
  }

  setPenroseResult(result: PenroseResult | null): void {
    this.penroseResult = result;
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

    // Draw Newton trajectory (dashed green) if available
    if (this.newtonResult && this.newtonResult.trajectory.length > 1) {
      const nTraj = this.newtonResult.trajectory;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(0, 200, 80, 0.7)";

      ctx.beginPath();
      const nx0 = cx + nTraj[0].r * Math.cos(nTraj[0].phi) * scale;
      const ny0 = cy - nTraj[0].r * Math.sin(nTraj[0].phi) * scale;
      ctx.moveTo(nx0, ny0);

      for (let i = 1; i < nTraj.length; i++) {
        const nx = cx + nTraj[i].r * Math.cos(nTraj[i].phi) * scale;
        const ny = cy - nTraj[i].r * Math.sin(nTraj[i].phi) * scale;
        ctx.lineTo(nx, ny);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Newton end marker (green diamond)
      const nEnd = nTraj[nTraj.length - 1];
      const nex = cx + nEnd.r * Math.cos(nEnd.phi) * scale;
      const ney = cy - nEnd.r * Math.sin(nEnd.phi) * scale;
      ctx.save();
      ctx.translate(nex, ney);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#0c8";
      ctx.fillRect(-2.5, -2.5, 5, 5);
      ctx.restore();
    }

    // Draw particle orbit (yellow) if available
    if (this.particleResult && this.particleResult.trajectory.length > 1) {
      const pTraj = this.particleResult.trajectory;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);

      for (let i = 1; i < pTraj.length; i++) {
        const p0 = pTraj[i - 1];
        const p1 = pTraj[i];
        const t = i / pTraj.length;

        const px0 = cx + p0.r * Math.cos(p0.phi) * scale;
        const py0 = cy - p0.r * Math.sin(p0.phi) * scale;
        const px1 = cx + p1.r * Math.cos(p1.phi) * scale;
        const py1 = cy - p1.r * Math.sin(p1.phi) * scale;

        ctx.beginPath();
        ctx.moveTo(px0, py0);
        ctx.lineTo(px1, py1);
        ctx.strokeStyle = `rgba(255, 200, 50, ${0.9 - 0.5 * t})`;
        ctx.stroke();
      }

      // Start marker
      const ps = pTraj[0];
      ctx.beginPath();
      ctx.arc(cx + ps.r * Math.cos(ps.phi) * scale, cy - ps.r * Math.sin(ps.phi) * scale, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fc0";
      ctx.fill();
    }

    // Draw Penrose process trajectories if available
    if (this.penroseResult) {
      const pr = this.penroseResult;

      // Draw ergosphere circle (equatorial, dashed purple)
      if (params.spin > 0) {
        const rErgo = params.mass + Math.sqrt(Math.max(params.mass * params.mass - (params.spin * params.mass) * (params.spin * params.mass), 0));
        this.drawCircle(ctx, cx, cy, rErgo * scale, "rgba(120, 80, 255, 0.6)", [4, 3]);
        ctx.font = "9px monospace";
        ctx.fillStyle = "#88f";
        ctx.fillText("ergo", cx + rErgo * scale + 3, cy + 10);
      }

      // Inbound trajectory (blue)
      this.drawTrajectoryPath(ctx, pr.inbound, cx, cy, scale, "rgba(80, 160, 255, 0.8)", 2);

      // Fragment A: retrograde plunging (red)
      this.drawTrajectoryPath(ctx, pr.fragmentA, cx, cy, scale, "rgba(255, 80, 80, 0.8)", 2);

      // Fragment B: prograde escaping (gold)
      this.drawTrajectoryPath(ctx, pr.fragmentB, cx, cy, scale, "rgba(255, 215, 0, 0.9)", 2.5);

      // Split point marker (white diamond)
      if (pr.inbound.length > 0) {
        const sp = pr.inbound[pr.inbound.length - 1];
        const spx = cx + sp.r * Math.cos(sp.phi) * scale;
        const spy = cy - sp.r * Math.sin(sp.phi) * scale;
        ctx.save();
        ctx.translate(spx, spy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#fff";
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      }
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

    let infoHtml =
      `<b>${outcomeLabels[result.outcome]}</b><br>` +
      `Closest approach: ${result.closestApproach.toFixed(2)} (${(result.closestApproach / rs).toFixed(2)} r<sub>s</sub>)<br>` +
      `Total deflection: ${deflDeg}&deg; (${(result.totalDeflection / Math.PI).toFixed(2)}&pi;)<br>` +
      `Disk crossings: ${result.diskCrossings}<br>` +
      `Points: ${result.trajectory.length}`;

    // Newton comparison info
    if (this.newtonResult) {
      const nDefl = (this.newtonResult.totalDeflection * 180 / Math.PI).toFixed(1);
      const ratio = this.newtonResult.totalDeflection > 0.001
        ? (result.totalDeflection / this.newtonResult.totalDeflection).toFixed(2)
        : "∞";
      infoHtml += `<br><span style="color:#0c8;">Newton: ${nDefl}&deg; | GR/Newton: ${ratio}x</span>`;
    }

    // Penrose process info
    if (this.penroseResult) {
      const pr = this.penroseResult;
      infoHtml += `<br><span style="color:#88f;">Penrose Process @ r=${pr.splitRadius.toFixed(2)}</span>`;
      infoHtml += `<br><span style="color:#5af;">E<sub>in</sub> = ${pr.energyIn.toFixed(3)}</span>`;
      infoHtml += ` <span style="color:#f55;">E<sub>A</sub> = ${pr.energyA.toFixed(3)}</span>`;
      infoHtml += ` <span style="color:#fd0;">E<sub>B</sub> = ${pr.energyB.toFixed(3)}</span>`;
      if (pr.energyB > pr.energyIn) {
        infoHtml += `<br><span style="color:#0f0;">E<sub>B</sub> &gt; E<sub>in</sub> : Energy extracted!</span>`;
      }
    }

    // Particle orbit info
    if (this.particleResult) {
      const pLabels: Record<string, string> = {
        circular: "Circular orbit",
        elliptical: "Elliptical orbit",
        plunging: "Plunging orbit",
        max_steps: "Max steps reached",
      };
      infoHtml += `<br><span style="color:#fc0;">${pLabels[this.particleResult.outcome]}: ${this.particleResult.orbitCount.toFixed(1)} orbits</span>`;
    }

    this.info.innerHTML = infoHtml;
  }

  private drawTrajectoryPath(
    ctx: CanvasRenderingContext2D,
    traj: { r: number; phi: number }[],
    cx: number, cy: number, scale: number,
    color: string, lineWidth: number
  ): void {
    if (traj.length < 2) return;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.setLineDash([]);
    ctx.beginPath();
    const x0 = cx + traj[0].r * Math.cos(traj[0].phi) * scale;
    const y0 = cy - traj[0].r * Math.sin(traj[0].phi) * scale;
    ctx.moveTo(x0, y0);
    for (let i = 1; i < traj.length; i++) {
      const x = cx + traj[i].r * Math.cos(traj[i].phi) * scale;
      const y = cy - traj[i].r * Math.sin(traj[i].phi) * scale;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
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
