// src/renderer.ts — WebGL2 engine: compile, draw fullscreen quad, starfield (W2)

import type { RenderState, Renderer, UniformLocations } from "./types";
import { getUniformLocations, setUniforms } from "./uniforms";

// ---------------------------------------------------------------------------
// Shader compilation helpers
// ---------------------------------------------------------------------------

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader object");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new Error(
      `Shader compile error (${type === gl.VERTEX_SHADER ? "vert" : "frag"}):\n${log}`
    );
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new Error(`Program link error:\n${log}`);
  }
  // Shaders can be detached after linking
  gl.detachShader(program, vs);
  gl.detachShader(program, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

// ---------------------------------------------------------------------------
// Fullscreen quad geometry
// ---------------------------------------------------------------------------

function createFullscreenQuad(gl: WebGL2RenderingContext): {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
} {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) throw new Error("Failed to create VAO/VBO");

  // Two triangles covering [-1,1] NDC
  const vertices = new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
  ]);

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  // a_position at location 0 (matches fullscreen.vert layout qualifier)
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  return { vao, vbo };
}

// ---------------------------------------------------------------------------
// Procedural starfield texture (2048 x 1024, equirectangular)
// ---------------------------------------------------------------------------

function generateStarfieldTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const W = 2048;
  const H = 1024;
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create starfield texture");

  const offscreen = document.createElement("canvas");
  offscreen.width = W;
  offscreen.height = H;
  const ctx = offscreen.getContext("2d");
  if (!ctx) throw new Error("Failed to create 2D context for starfield");

  // Black background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  // Deterministic PRNG (xorshift)
  let seed = 42;
  function rand(): number {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }

  // Subtle Milky Way band (horizontal center of equirectangular = equator)
  const mwGrad = ctx.createLinearGradient(0, H * 0.35, 0, H * 0.65);
  mwGrad.addColorStop(0, "rgba(35, 25, 55, 0)");
  mwGrad.addColorStop(0.5, "rgba(35, 25, 55, 0.12)");
  mwGrad.addColorStop(1, "rgba(35, 25, 55, 0)");
  ctx.fillStyle = mwGrad;
  ctx.fillRect(0, 0, W, H);

  // Star spectral colors (approximate B-V color index)
  const STAR_COLORS = [
    "180,200,255", // O/B class — blue-white
    "210,225,255", // A class  — white-blue
    "255,255,240", // F class  — white
    "255,245,200", // G class  — yellow-white
    "255,215,160", // K class  — orange
    "255,180,130", // M class  — red-orange
  ];
  // Weights: most stars are cooler (K/M), fewer hot (O/B)
  const COLOR_WEIGHTS = [0.05, 0.1, 0.2, 0.3, 0.2, 0.15];

  function pickStarColor(): string {
    let r = rand();
    for (let i = 0; i < COLOR_WEIGHTS.length; i++) {
      r -= COLOR_WEIGHTS[i];
      if (r <= 0) return STAR_COLORS[i];
    }
    return STAR_COLORS[3]; // default G class
  }

  // Draw stars with varying size, color, brightness
  const STAR_COUNT = 10000;
  for (let i = 0; i < STAR_COUNT; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const brightness = 0.3 + rand() * 0.7;
    // Size distribution: many small, few large
    const radius = 0.3 + rand() * rand() * 1.5;
    const rgb = pickStarColor();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb},${brightness})`;
    ctx.fill();

    // Bright, large stars get a soft glow halo
    if (brightness > 0.85 && radius > 0.9) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
      glow.addColorStop(0, `rgba(${rgb},0.12)`);
      glow.addColorStop(1, `rgba(${rgb},0)`);
      ctx.beginPath();
      ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
    }
  }

  // Upload to GL
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);
  gl.generateMipmap(gl.TEXTURE_2D);

  // Horizontal: REPEAT (seamless azimuthal wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  // Vertical: CLAMP_TO_EDGE (prevents polar artifacts in equirectangular)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

// ---------------------------------------------------------------------------
// Shader program bundle (program + uniform locations)
// ---------------------------------------------------------------------------

interface ProgramBundle {
  program: WebGLProgram;
  locations: UniformLocations;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create the WebGL2 renderer with dual shader programs
 * (blackhole mode + grid mode).
 *
 * @param canvas         Target canvas element
 * @param vertSrc        Vertex shader source (fullscreen.vert)
 * @param blackholeFragSrc  Fragment shader source (blackhole.frag)
 * @param gridFragSrc    Fragment shader source (grid.frag)
 * @returns              Renderer with render() and dispose()
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  vertSrc: string,
  blackholeFragSrc: string,
  gridFragSrc: string
): Renderer {
  const glOrNull = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (!glOrNull) {
    throw new Error(
      "WebGL2 not supported. Please use a modern browser with WebGL2 support."
    );
  }
  const gl: WebGL2RenderingContext = glOrNull;

  // Compile both shader programs
  const bhBundle: ProgramBundle = {
    program: createProgram(gl, vertSrc, blackholeFragSrc),
    locations: null as unknown as UniformLocations,
  };
  bhBundle.locations = getUniformLocations(gl, bhBundle.program);

  const gridBundle: ProgramBundle = {
    program: createProgram(gl, vertSrc, gridFragSrc),
    locations: null as unknown as UniformLocations,
  };
  gridBundle.locations = getUniformLocations(gl, gridBundle.program);

  // Shared resources
  const { vao, vbo } = createFullscreenQuad(gl);
  const starfieldTex = generateStarfieldTexture(gl);

  // Track current canvas backing-store size to avoid redundant viewport calls
  let currentWidth = 0;
  let currentHeight = 0;

  function render(state: RenderState): void {
    const [w, h] = state.resolution;

    // Resize backing store if needed
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (w !== currentWidth || h !== currentHeight) {
      gl.viewport(0, 0, w, h);
      currentWidth = w;
      currentHeight = h;
    }

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Select program based on grid mode toggle
    const bundle = state.params.showGrid ? gridBundle : bhBundle;

    gl.useProgram(bundle.program);

    // Bind starfield to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, starfieldTex);

    setUniforms(gl, bundle.locations, state);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  function dispose(): void {
    gl.deleteTexture(starfieldTex);
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(bhBundle.program);
    gl.deleteProgram(gridBundle.program);
  }

  return { render, dispose };
}
