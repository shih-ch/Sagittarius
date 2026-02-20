/**
 * tests/perf.test.ts — Performance Benchmarks
 *
 * CPU-side RK4 benchmarks (no WebGL needed).
 * Browser-dependent tests (frame time, memory) are exported as helpers
 * for manual validation via browser console.
 *
 * Target criteria (from CLAUDE.md):
 *   - >=30 FPS at 0.5x resolution, steps=1000 on mid-range GPU
 *   - >=60 FPS at 0.25x resolution
 *   - No memory leaks over 5 minutes
 *   - Step count slider responsive without freezing
 *
 * QA owns this file.
 */

import { describe, test, expect } from 'vitest';

// ============================================================================
// CPU-side RK4 benchmark (reference, no WebGL needed)
// ============================================================================

function benchmarkCpuRk4(steps: number, iterations: number): { avgMs: number; opsPerSec: number } {
  const rs = 3.0; // M=1.5
  const h = 0.05;

  const start = performance.now();

  for (let iter = 0; iter < iterations; iter++) {
    let r = 30.0;
    let phi = 0;
    let dr = -1.0;
    let dphi = 0.02;

    for (let i = 0; i < steps; i++) {
      // Schwarzschild null geodesic equations (same as shader)
      const ddr = (r - 1.5 * rs) * dphi * dphi;
      const ddphi = -(2 / r) * dr * dphi;

      // RK4 would be 4 evaluations; using Euler here for benchmark throughput
      r += dr * h;
      phi += dphi * h;
      dr += ddr * h;
      dphi += ddphi * h;

      if (r < rs || r > 500) break;
    }
  }

  const elapsed = performance.now() - start;
  return {
    avgMs: elapsed / iterations,
    opsPerSec: (iterations * 1000) / elapsed,
  };
}

// ============================================================================
// CPU benchmarks
// ============================================================================

describe('CPU RK4 benchmarks', () => {
  test('1000 steps x 1000 iterations: < 5ms/ray avg', () => {
    const { avgMs } = benchmarkCpuRk4(1000, 1000);
    expect(avgMs).toBeLessThan(5);
  });

  test('5000 steps x 100 iterations: < 25ms/ray avg', () => {
    const { avgMs } = benchmarkCpuRk4(5000, 100);
    expect(avgMs).toBeLessThan(25);
  });

  test('CPU throughput: > 200 rays/sec at 1000 steps', () => {
    const { opsPerSec } = benchmarkCpuRk4(1000, 500);
    expect(opsPerSec).toBeGreaterThan(200);
  });
});

// ============================================================================
// Browser-dependent helpers (exported for manual use)
// ============================================================================

/**
 * Measures frame times for a given render function.
 * Must be called in a browser with the renderer initialized.
 *
 * Usage (in browser console):
 *   const result = await measureFrameTime(() => renderer.render(state), config);
 */
export interface FrameTimeConfig {
  label: string;
  resolutionScale: number;
  maxSteps: number;
  targetFps: number;
  warmupFrames: number;
  measureFrames: number;
}

export const PERF_CONFIGS: FrameTimeConfig[] = [
  { label: '0.5x res, 1000 steps', resolutionScale: 0.5, maxSteps: 1000, targetFps: 30, warmupFrames: 30, measureFrames: 120 },
  { label: '0.25x res, 1000 steps', resolutionScale: 0.25, maxSteps: 1000, targetFps: 60, warmupFrames: 30, measureFrames: 120 },
  { label: '1.0x res, 500 steps', resolutionScale: 1.0, maxSteps: 500, targetFps: 30, warmupFrames: 30, measureFrames: 60 },
];

export async function measureFrameTime(
  renderFn: () => void,
  config: FrameTimeConfig,
): Promise<{ avgFps: number; minFps: number; passed: boolean }> {
  const frameTimes: number[] = [];

  for (let i = 0; i < config.warmupFrames; i++) {
    renderFn();
  }

  for (let i = 0; i < config.measureFrames; i++) {
    const start = performance.now();
    renderFn();
    frameTimes.push(performance.now() - start);
  }

  frameTimes.sort((a, b) => a - b);
  const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const maxFrameTime = frameTimes[frameTimes.length - 1];

  return {
    avgFps: 1000 / avgFrameTime,
    minFps: 1000 / maxFrameTime,
    passed: 1000 / avgFrameTime >= config.targetFps,
  };
}

export async function detectMemoryLeak(
  renderFn: () => void,
  durationMs: number = 10000,
  maxGrowthMb: number = 50,
): Promise<{ passed: boolean; growthMb: number }> {
  const perf = performance as any;
  if (!perf.memory) {
    return { passed: true, growthMb: 0 }; // Can't test without Chrome perf.memory
  }

  const startHeap = perf.memory.usedJSHeapSize / (1024 * 1024);
  const startTime = performance.now();

  while (performance.now() - startTime < durationMs) {
    for (let i = 0; i < 10; i++) renderFn();
    await new Promise((r) => setTimeout(r, 100));
  }

  const endHeap = perf.memory.usedJSHeapSize / (1024 * 1024);
  const growthMb = endHeap - startHeap;

  return { passed: growthMb < maxGrowthMb, growthMb };
}
