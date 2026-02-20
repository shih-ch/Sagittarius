// src/camera.ts — Orbital camera with gl-matrix (W3)

import { mat4, vec3 } from "gl-matrix";
import type { ICamera } from "./types";
import {
  DEFAULT_CAMERA_DISTANCE,
  DEFAULT_CAMERA_THETA,
  DEFAULT_CAMERA_PHI,
  DEFAULT_FOV,
  MIN_CAMERA_DISTANCE,
  MAX_CAMERA_DISTANCE,
} from "./math/constants";

const ROTATE_SPEED = 0.005; // radians per pixel
const ZOOM_SPEED = 0.5; // distance per wheel tick
const THETA_MIN = 0.01;
const THETA_MAX = Math.PI - 0.01;

export class Camera implements ICamera {
  private theta: number = DEFAULT_CAMERA_THETA;
  private phi: number = DEFAULT_CAMERA_PHI;
  private distance: number = DEFAULT_CAMERA_DISTANCE;
  private readonly target: vec3 = vec3.fromValues(0, 0, 0);
  private readonly fov: number = DEFAULT_FOV;

  // Reusable matrices to avoid per-frame allocation
  private readonly viewMat: mat4 = mat4.create();
  private readonly projMat: mat4 = mat4.create();
  private readonly vpMat: mat4 = mat4.create();
  private readonly invVpMat: mat4 = mat4.create();

  // Mouse/touch state
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;
  private pinchDist = 0;

  // Stored handler references for cleanup in dispose()
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseUp: () => void;
  private onContextMenu: (e: Event) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.onMouseMove = this.handleMouseMove.bind(this);
    this.onMouseUp = this.handleMouseUp.bind(this);
    this.onContextMenu = (e) => e.preventDefault();

    this.bindMouse();
    this.bindTouch();
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  // ── Public API (ICamera) ──────────────────────────────────────────

  getPosition(): [number, number, number] {
    const sinT = Math.sin(this.theta);
    const cosT = Math.cos(this.theta);
    const sinP = Math.sin(this.phi);
    const cosP = Math.cos(this.phi);
    return [
      this.target[0] + this.distance * sinT * cosP,
      this.target[1] + this.distance * cosT,
      this.target[2] + this.distance * sinT * sinP,
    ];
  }

  getViewMatrix(): mat4 {
    const pos = this.getPosition();
    mat4.lookAt(
      this.viewMat,
      vec3.fromValues(pos[0], pos[1], pos[2]),
      this.target,
      vec3.fromValues(0, 1, 0)
    );
    return this.viewMat;
  }

  getProjectionMatrix(aspect: number): mat4 {
    mat4.perspective(
      this.projMat,
      (this.fov * Math.PI) / 180,
      aspect,
      0.1,
      1000
    );
    return this.projMat;
  }

  getInvViewProjectionMatrix(aspect: number): Float32Array {
    const view = this.getViewMatrix();
    const proj = this.getProjectionMatrix(aspect);
    mat4.multiply(this.vpMat, proj, view);
    mat4.invert(this.invVpMat, this.vpMat);
    return this.invVpMat as Float32Array;
  }

  rotate(dTheta: number, dPhi: number): void {
    this.theta = Math.max(THETA_MIN, Math.min(THETA_MAX, this.theta + dTheta));
    this.phi += dPhi;
  }

  zoom(delta: number): void {
    this.distance = Math.max(
      MIN_CAMERA_DISTANCE,
      Math.min(MAX_CAMERA_DISTANCE, this.distance + delta)
    );
  }

  reset(): void {
    this.theta = DEFAULT_CAMERA_THETA;
    this.phi = DEFAULT_CAMERA_PHI;
    this.distance = DEFAULT_CAMERA_DISTANCE;
  }

  dispose(): void {
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }

  // ── Mouse handling ────────────────────────────────────────────────

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.rotate(dy * ROTATE_SPEED, -dx * ROTATE_SPEED);
  }

  private handleMouseUp(): void {
    this.isDragging = false;
  }

  private bindMouse(): void {
    this.canvas.addEventListener("mousedown", (e: MouseEvent) => {
      this.isDragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);

    this.canvas.addEventListener("wheel", (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? 1 : -1;
      this.zoom(direction * ZOOM_SPEED);
    }, { passive: false });
  }

  // ── Touch handling ────────────────────────────────────────────────

  private bindTouch(): void {
    this.canvas.addEventListener("touchstart", (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        this.pinchDist = this.getTouchDistance(e.touches);
      }
    }, { passive: false });

    this.canvas.addEventListener("touchmove", (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && this.isDragging) {
        const dx = e.touches[0].clientX - this.lastX;
        const dy = e.touches[0].clientY - this.lastY;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
        this.rotate(dy * ROTATE_SPEED, -dx * ROTATE_SPEED);
      } else if (e.touches.length === 2) {
        const newDist = this.getTouchDistance(e.touches);
        const delta = this.pinchDist - newDist;
        this.zoom(delta * 0.05);
        this.pinchDist = newDist;
      }
    }, { passive: false });

    this.canvas.addEventListener("touchend", () => {
      this.isDragging = false;
    });
  }

  private getTouchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
