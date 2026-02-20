# Sagittarius — Multi-Agent Workflow Reference

## Team (5 Agents)

```
┌───────────────────────────┬───────────────────────────┐
│                           │                           │
│  🎯 LEAD                  │  👷 W2 — Renderer         │
│  Scaffold & Integrate     │  renderer.ts              │
│                           │  uniforms.ts              │
│  package.json, vite       │                           │
│  index.html, main.ts      │  WebGL2 context, shader   │
│  types.ts, constants.ts   │  compile, fullscreen quad, │
│                           │  procedural starfield tex  │
├───────────────────────────┼───────────────────────────┤
│                           │                           │
│  👷 W1 — Shaders ⭐        │  👷 W3 — Camera & UI      │
│  blackhole.frag (core!)   │  camera.ts                │
│  fullscreen.vert          │  controls.ts              │
│  grid.frag                │                           │
│                           │  Orbital cam, mouse/touch, │
│  Geodesic eqs, RK4,       │  sliders, FPS, resolution │
│  disk, starfield, redshift│                           │
├───────────────────────────┴───────────────────────────┤
│                                                       │
│  🔍 QA — Verification                                 │
│  tests/physics.test.ts    — geodesic correctness      │
│  tests/visual-benchmark.ts — shader compile, uniforms │
│  tests/perf.test.ts       — frame time benchmarks     │
│  tests/edge-cases.test.ts — mass=0, steps=1, resize   │
│                                                       │
└───────────────────────────────────────────────────────┘
```

## Communication Files

```
Lead → Workers:                  Workers → Lead:
/tmp/sg_task_w1.txt              /tmp/sg_w1_status.txt
/tmp/sg_task_w2.txt              /tmp/sg_w2_status.txt
/tmp/sg_task_w3.txt              /tmp/sg_w3_status.txt
/tmp/sg_task_qa.txt              /tmp/sg_qa_status.txt
                                 /tmp/sg_qa_bugs.txt (bug reports)
```

## Data Flow

```
User Input (mouse/slider)
    │
    ▼
controls.ts ──getParams()──→ main.ts
camera.ts ──getPosition()──→ main.ts
          ──getInvVP()─────→ main.ts
    │
    ▼
renderer.ts ──setUniforms()──→ WebGL Program
    │
    ▼
blackhole.frag (GPU per-pixel)
    │  ┌─ r < rs → black
    ├──┤  ray hits disk → disk color + redshift
    │  └─ r > escape → starfield sample
    ▼
Screen Output
```

## Execution Phases

```
Time ──────────────────────────────────────────────────→

Phase 1: SCAFFOLD (Lead only, ~5 min)
├── npm init, install deps
├── Create index.html, main.ts, types.ts, constants.ts
├── Write task files for W1, W2, W3, QA
└── Signal workers to start

Phase 2: PARALLEL DEV (All workers, ~15-30 min)
├── W1: GLSL shaders (blackhole.frag is critical path)
├── W2: renderer.ts + uniforms.ts
├── W3: camera.ts + controls.ts
├── QA: Prepare test stubs, compute expected values
└── Lead: Monitor, answer questions, unblock

Phase 3: INTEGRATION (Lead, ~10 min)
├── Collect all worker files
├── Wire main.ts imports
├── Fix TypeScript / build errors
├── npm run dev → verify canvas renders
└── Signal QA to begin validation

Phase 4: QA VALIDATION (QA, ~10 min)
├── Shader compilation check
├── Uniform name matching
├── Physics correctness (TypeScript geodesic reference)
├── Edge case testing
├── Performance benchmarks
└── File bugs → Lead assigns fixes → Workers patch

Phase 5: POLISH (All, ~5 min)
├── Fix QA bugs
├── Tune defaults
├── Final build: npm run build
└── README.md
```

## Quick Reference — Uniform Contract

| Uniform | GLSL Type | TS Setter | Source |
|---------|-----------|-----------|--------|
| u_resolution | vec2 | uniform2f | canvas.width/height |
| u_cameraPos | vec3 | uniform3fv | camera.getPosition() |
| u_invViewProjection | mat4 | uniformMatrix4fv | camera.getInvVP(aspect) |
| u_mass | float | uniform1f | controls slider |
| u_time | float | uniform1f | performance.now()/1000 |
| u_maxSteps | int | uniform1i | controls slider |
| u_stepSize | float | uniform1f | controls slider |
| u_showDisk | int (bool) | uniform1i | controls checkbox |
| u_showGrid | int (bool) | uniform1i | controls checkbox |
| u_starfield | sampler2D | uniform1i(0) | texture unit 0 |
