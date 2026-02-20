// src/renderer.ts — WebGL2 engine: compile, draw fullscreen quad, starfield, bloom (W2)

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
// FBO helper for bloom pipeline
// ---------------------------------------------------------------------------

interface FBO {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

function createFBO(gl: WebGL2RenderingContext, w: number, h: number): FBO {
  const framebuffer = gl.createFramebuffer()!;
  const texture = gl.createTexture()!;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { framebuffer, texture, width: w, height: h };
}

function resizeFBO(gl: WebGL2RenderingContext, fbo: FBO, w: number, h: number): void {
  if (fbo.width === w && fbo.height === h) return;
  gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  fbo.width = w;
  fbo.height = h;
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

interface PostProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createRenderer(
  canvas: HTMLCanvasElement,
  vertSrc: string,
  blackholeFragSrc: string,
  gridFragSrc: string,
  bloomExtractFragSrc?: string,
  blurFragSrc?: string,
  compositeFragSrc?: string
): Renderer {
  const glOrNull = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!glOrNull) {
    throw new Error(
      "WebGL2 not supported. Please use a modern browser with WebGL2 support."
    );
  }
  const gl: WebGL2RenderingContext = glOrNull;

  // Enable float textures for bloom HDR FBOs
  const extFloat = gl.getExtension("EXT_color_buffer_float");
  if (!extFloat) {
    console.warn("EXT_color_buffer_float not available — bloom will be disabled");
  }

  // Compile main shader programs
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

  // Compile bloom post-processing programs (if shader sources provided)
  let extractProg: PostProgram | null = null;
  let blurProg: PostProgram | null = null;
  let compositeProg: PostProgram | null = null;
  const bloomAvailable = !!(bloomExtractFragSrc && blurFragSrc && compositeFragSrc && extFloat);

  if (bloomAvailable) {
    try {
      const ep = createProgram(gl, vertSrc, bloomExtractFragSrc!);
      extractProg = {
        program: ep,
        uniforms: {
          u_scene: gl.getUniformLocation(ep, "u_scene"),
          u_threshold: gl.getUniformLocation(ep, "u_threshold"),
        },
      };

      const bp = createProgram(gl, vertSrc, blurFragSrc!);
      blurProg = {
        program: bp,
        uniforms: {
          u_image: gl.getUniformLocation(bp, "u_image"),
          u_direction: gl.getUniformLocation(bp, "u_direction"),
        },
      };

      const cp = createProgram(gl, vertSrc, compositeFragSrc!);
      compositeProg = {
        program: cp,
        uniforms: {
          u_scene: gl.getUniformLocation(cp, "u_scene"),
          u_bloom: gl.getUniformLocation(cp, "u_bloom"),
          u_bloomIntensity: gl.getUniformLocation(cp, "u_bloomIntensity"),
        },
      };
    } catch (e) {
      console.warn("Bloom shader compilation failed, disabling bloom:", e);
      extractProg = null;
      blurProg = null;
      compositeProg = null;
    }
  }

  // Shared resources
  const { vao, vbo } = createFullscreenQuad(gl);
  const starfieldTex = generateStarfieldTexture(gl);

  // Bloom FBOs (created lazily)
  let sceneFBO: FBO | null = null;
  let extractFBO: FBO | null = null;
  let blurFBO1: FBO | null = null;
  let blurFBO2: FBO | null = null;

  // Track current canvas backing-store size to avoid redundant viewport calls
  let currentWidth = 0;
  let currentHeight = 0;

  function drawQuad(): void {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  function renderScene(state: RenderState, w: number, h: number): void {
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const bundle = state.params.showGrid ? gridBundle : bhBundle;
    gl.useProgram(bundle.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, starfieldTex);

    setUniforms(gl, bundle.locations, state);
    drawQuad();
  }

  function render(state: RenderState): void {
    const [w, h] = state.resolution;

    // Resize backing store if needed
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    currentWidth = w;
    currentHeight = h;

    const bloomIntensity = state.params.bloomIntensity;
    const useBloom = bloomIntensity > 0 && extractProg && blurProg && compositeProg;

    if (useBloom) {
      // Bloom half-resolution for performance
      const bw = Math.max(1, Math.floor(w / 2));
      const bh = Math.max(1, Math.floor(h / 2));

      // Ensure FBOs exist and are correct size
      if (!sceneFBO) sceneFBO = createFBO(gl, w, h);
      else resizeFBO(gl, sceneFBO, w, h);

      if (!extractFBO) extractFBO = createFBO(gl, bw, bh);
      else resizeFBO(gl, extractFBO, bw, bh);

      if (!blurFBO1) blurFBO1 = createFBO(gl, bw, bh);
      else resizeFBO(gl, blurFBO1, bw, bh);

      if (!blurFBO2) blurFBO2 = createFBO(gl, bw, bh);
      else resizeFBO(gl, blurFBO2, bw, bh);

      // Pass 1: Render scene to FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.framebuffer);
      renderScene(state, w, h);

      // Pass 2: Extract bright pixels
      gl.bindFramebuffer(gl.FRAMEBUFFER, extractFBO.framebuffer);
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(extractProg!.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneFBO.texture);
      gl.uniform1i(extractProg!.uniforms.u_scene, 0);
      gl.uniform1f(extractProg!.uniforms.u_threshold, 0.5);
      drawQuad();

      // Pass 3: Horizontal blur
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurFBO1.framebuffer);
      gl.useProgram(blurProg!.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, extractFBO.texture);
      gl.uniform1i(blurProg!.uniforms.u_image, 0);
      gl.uniform2f(blurProg!.uniforms.u_direction, 1.0 / bw, 0.0);
      drawQuad();

      // Pass 4: Vertical blur
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurFBO2.framebuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, blurFBO1.texture);
      gl.uniform2f(blurProg!.uniforms.u_direction, 0.0, 1.0 / bh);
      drawQuad();

      // Pass 5: Composite to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(compositeProg!.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneFBO.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blurFBO2.texture);
      gl.uniform1i(compositeProg!.uniforms.u_scene, 0);
      gl.uniform1i(compositeProg!.uniforms.u_bloom, 1);
      gl.uniform1f(compositeProg!.uniforms.u_bloomIntensity, bloomIntensity);
      drawQuad();

      // Reset active texture
      gl.activeTexture(gl.TEXTURE0);
    } else {
      // No bloom: render directly to screen (same as before)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      renderScene(state, w, h);
    }
  }

  function dispose(): void {
    gl.deleteTexture(starfieldTex);
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(bhBundle.program);
    gl.deleteProgram(gridBundle.program);
    if (extractProg) gl.deleteProgram(extractProg.program);
    if (blurProg) gl.deleteProgram(blurProg.program);
    if (compositeProg) gl.deleteProgram(compositeProg.program);
    if (sceneFBO) { gl.deleteFramebuffer(sceneFBO.framebuffer); gl.deleteTexture(sceneFBO.texture); }
    if (extractFBO) { gl.deleteFramebuffer(extractFBO.framebuffer); gl.deleteTexture(extractFBO.texture); }
    if (blurFBO1) { gl.deleteFramebuffer(blurFBO1.framebuffer); gl.deleteTexture(blurFBO1.texture); }
    if (blurFBO2) { gl.deleteFramebuffer(blurFBO2.framebuffer); gl.deleteTexture(blurFBO2.texture); }
  }

  return { render, dispose };
}
