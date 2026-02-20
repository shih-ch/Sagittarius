/**
 * tests/visual-benchmark.ts — Visual Regression Helper
 *
 * Utilities for capturing and comparing rendered frames.
 * Used for visual regression testing and validating:
 *   - BH shadow symmetry
 *   - Accretion disk appearance
 *   - Einstein ring formation
 *   - Starfield rendering
 *
 * QA owns this file.
 */

// ============================================================================
// Types
// ============================================================================

export interface PixelData {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export interface ComparisonResult {
  match: boolean;
  diffPercent: number;
  maxChannelDiff: number;
  diffPixelCount: number;
  totalPixels: number;
}

export interface SymmetryResult {
  symmetric: boolean;
  asymmetryPercent: number;
  detail: string;
}

export interface ShadowMeasurement {
  centerX: number;
  centerY: number;
  radiusPixels: number;
  radiusWorld: number;  // in units of M
  isCircular: boolean;
  circularityError: number; // 0 = perfect circle
}

// ============================================================================
// Frame Capture
// ============================================================================

/**
 * Capture the current WebGL canvas content as pixel data.
 */
export function captureFrame(gl: WebGL2RenderingContext): PixelData {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const data = new Uint8ClampedArray(width * height * 4);

  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);

  // WebGL reads bottom-to-top; flip vertically
  const rowSize = width * 4;
  const temp = new Uint8ClampedArray(rowSize);
  for (let y = 0; y < Math.floor(height / 2); y++) {
    const topOffset = y * rowSize;
    const botOffset = (height - 1 - y) * rowSize;
    temp.set(data.subarray(topOffset, topOffset + rowSize));
    data.copyWithin(topOffset, botOffset, botOffset + rowSize);
    data.set(temp, botOffset);
  }

  return { width, height, data };
}

// ============================================================================
// Pixel Comparison
// ============================================================================

/**
 * Compare two frames pixel-by-pixel.
 * Returns match percentage and diff statistics.
 */
export function compareFrames(
  a: PixelData,
  b: PixelData,
  tolerance: number = 5, // per-channel tolerance (0-255)
): ComparisonResult {
  if (a.width !== b.width || a.height !== b.height) {
    return {
      match: false,
      diffPercent: 100,
      maxChannelDiff: 255,
      diffPixelCount: a.width * a.height,
      totalPixels: a.width * a.height,
    };
  }

  const totalPixels = a.width * a.height;
  let diffPixelCount = 0;
  let maxChannelDiff = 0;

  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    const da = Math.abs(a.data[i + 3] - b.data[i + 3]);

    const maxDiff = Math.max(dr, dg, db, da);
    if (maxDiff > maxChannelDiff) maxChannelDiff = maxDiff;

    if (maxDiff > tolerance) {
      diffPixelCount++;
    }
  }

  const diffPercent = (diffPixelCount / totalPixels) * 100;

  return {
    match: diffPercent < 0.5, // < 0.5% different pixels = match
    diffPercent,
    maxChannelDiff,
    diffPixelCount,
    totalPixels,
  };
}

// ============================================================================
// Shadow Analysis
// ============================================================================

/**
 * Measure the black hole shadow from a rendered frame.
 * Assumes BH is centered in the frame and shadow pixels are near-black.
 */
export function measureShadow(
  frame: PixelData,
  blackThreshold: number = 10, // RGB values below this = "black"
): ShadowMeasurement {
  const { width, height, data } = frame;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);

  // Find shadow boundary by sampling radially from center
  const numAngles = 360;
  const radii: number[] = [];

  for (let a = 0; a < numAngles; a++) {
    const angle = (a / numAngles) * 2 * Math.PI;
    let lastBlackR = 0;

    for (let r = 0; r < Math.min(width, height) / 2; r++) {
      const px = Math.round(cx + r * Math.cos(angle));
      const py = Math.round(cy + r * Math.sin(angle));

      if (px < 0 || px >= width || py < 0 || py >= height) break;

      const idx = (py * width + px) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      if (brightness < blackThreshold) {
        lastBlackR = r;
      }
    }

    radii.push(lastBlackR);
  }

  // Compute mean radius and circularity
  const meanRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
  const maxDev = Math.max(...radii.map((r) => Math.abs(r - meanRadius)));
  const circularityError = meanRadius > 0 ? maxDev / meanRadius : 1;

  return {
    centerX: cx,
    centerY: cy,
    radiusPixels: meanRadius,
    radiusWorld: 0, // Needs camera FOV / projection to convert
    isCircular: circularityError < 0.1, // < 10% deviation
    circularityError,
  };
}

// ============================================================================
// Symmetry Check
// ============================================================================

/**
 * Check if a frame is radially symmetric around the center.
 * Useful for verifying face-on disk view.
 */
export function checkRadialSymmetry(
  frame: PixelData,
  tolerance: number = 15,
): SymmetryResult {
  const { width, height, data } = frame;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const maxR = Math.min(cx, cy);

  let totalSamples = 0;
  let asymmetricSamples = 0;

  // For each radius, compare pixel brightness at different angles
  for (let r = 5; r < maxR; r += 2) {
    const brightnesses: number[] = [];

    for (let a = 0; a < 36; a++) {
      const angle = (a / 36) * 2 * Math.PI;
      const px = Math.round(cx + r * Math.cos(angle));
      const py = Math.round(cy + r * Math.sin(angle));

      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const idx = (py * width + px) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      brightnesses.push(brightness);
    }

    if (brightnesses.length < 2) continue;

    const mean = brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length;
    for (const b of brightnesses) {
      totalSamples++;
      if (Math.abs(b - mean) > tolerance) {
        asymmetricSamples++;
      }
    }
  }

  const asymmetryPercent = totalSamples > 0 ? (asymmetricSamples / totalSamples) * 100 : 0;

  return {
    symmetric: asymmetryPercent < 5, // < 5% asymmetric samples
    asymmetryPercent,
    detail: `${asymmetricSamples}/${totalSamples} samples deviate (${asymmetryPercent.toFixed(1)}%)`,
  };
}

// ============================================================================
// Einstein Ring Detection
// ============================================================================

/**
 * Detect if an Einstein ring is present in the frame.
 * Looks for a bright ring pattern around the shadow.
 */
export function detectEinsteinRing(
  frame: PixelData,
  brightThreshold: number = 100,
): {
  detected: boolean;
  ringRadiusPixels: number;
  brightnessProfile: number[];
} {
  const { width, height, data } = frame;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const maxR = Math.min(cx, cy);

  // Compute average brightness at each radius
  const brightnessProfile: number[] = [];

  for (let r = 0; r < maxR; r++) {
    let totalBrightness = 0;
    let count = 0;

    for (let a = 0; a < 72; a++) {
      const angle = (a / 72) * 2 * Math.PI;
      const px = Math.round(cx + r * Math.cos(angle));
      const py = Math.round(cy + r * Math.sin(angle));

      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const idx = (py * width + px) * 4;
      totalBrightness += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      count++;
    }

    brightnessProfile.push(count > 0 ? totalBrightness / count : 0);
  }

  // Find the first bright peak after the dark shadow
  let inShadow = true;
  let ringRadius = 0;
  let peakBrightness = 0;

  for (let r = 1; r < brightnessProfile.length; r++) {
    if (inShadow && brightnessProfile[r] > brightThreshold) {
      inShadow = false;
    }
    if (!inShadow && brightnessProfile[r] > peakBrightness) {
      peakBrightness = brightnessProfile[r];
      ringRadius = r;
    }
    // Stop after finding the first ring (peak then decline)
    if (!inShadow && brightnessProfile[r] < peakBrightness * 0.5 && ringRadius > 0) {
      break;
    }
  }

  return {
    detected: peakBrightness > brightThreshold && ringRadius > 0,
    ringRadiusPixels: ringRadius,
    brightnessProfile,
  };
}

// ============================================================================
// Color Analysis
// ============================================================================

/**
 * Check that event horizon pixels are truly black (absorbed rays).
 */
export function verifyEventHorizonBlack(
  frame: PixelData,
  shadowRadius: number, // in pixels
  threshold: number = 5,
): { allBlack: boolean; brightestPixel: number; sampleCount: number } {
  const { width, height, data } = frame;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);

  let brightestPixel = 0;
  let sampleCount = 0;

  // Sample inside 80% of shadow radius (well inside the horizon)
  const innerRadius = shadowRadius * 0.8;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < innerRadius) {
        const idx = (y * width + x) * 4;
        const brightness = Math.max(data[idx], data[idx + 1], data[idx + 2]);
        if (brightness > brightestPixel) brightestPixel = brightness;
        sampleCount++;
      }
    }
  }

  return {
    allBlack: brightestPixel <= threshold,
    brightestPixel,
    sampleCount,
  };
}

// ============================================================================
// Test Runner (for visual benchmarks)
// ============================================================================

/**
 * Run all visual checks on a captured frame.
 * Returns a summary of all visual test results.
 */
export function runVisualChecks(frame: PixelData): {
  shadow: ShadowMeasurement;
  symmetry: SymmetryResult;
  einsteinRing: ReturnType<typeof detectEinsteinRing>;
  horizonBlack: ReturnType<typeof verifyEventHorizonBlack>;
} {
  const shadow = measureShadow(frame);
  const symmetry = checkRadialSymmetry(frame);
  const einsteinRing = detectEinsteinRing(frame);
  const horizonBlack = verifyEventHorizonBlack(frame, shadow.radiusPixels);

  return { shadow, symmetry, einsteinRing, horizonBlack };
}

console.log('visual-benchmark.ts loaded — use captureFrame(gl) + runVisualChecks(frame) in browser');
