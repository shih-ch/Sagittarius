# Sagittarius — Web Black Hole Simulation

## Overview
Real-time black hole simulation in the browser (WebGL2 fragment shader ray marching).
Based on the Schwarzschild metric. Renders gravitational lensing, accretion disk,
photon sphere, and gravitational redshift effects.

**Reference:** https://github.com/kavan010/black_hole (original C++/OpenGL)

## Tech Stack
- TypeScript + Vite
- WebGL2 (fragment shader ray marching)
- gl-matrix for vector/matrix math
- HTML/CSS control panel

## Project Structure

```
sagittarius/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html                    # Canvas + UI panel
├── src/
│   ├── main.ts                   # App bootstrap, render loop    [LEAD]
│   ├── types.ts                  # Shared interfaces             [LEAD]
│   ├── camera.ts                 # Orbital camera                [W3]
│   ├── controls.ts               # UI panel bindings             [W3]
│   ├── renderer.ts               # WebGL2 engine                 [W2]
│   ├── uniforms.ts               # Uniform management            [W2]
│   ├── shaders/
│   │   ├── fullscreen.vert       # Quad vertex shader            [W1]
│   │   ├── blackhole.frag        # Core ray marching shader      [W1]
│   │   └── grid.frag             # Spacetime grid shader         [W1]
│   └── math/
│       └── constants.ts          # Physics constants             [LEAD]
├── tests/
│   ├── physics.test.ts           # Physics correctness tests     [QA]
│   ├── visual-benchmark.ts       # Visual regression helper      [QA]
│   ├── perf.test.ts              # Performance benchmarks        [QA]
│   └── edge-cases.test.ts        # Edge case validation          [QA]
└── README.md
```

## Team: 1 Lead + 3 Workers + 1 QA

| Agent | Owns | Responsibility |
|-------|------|----------------|
| **Lead** | main.ts, types.ts, constants.ts, index.html, build config | Scaffold, coordinate, integrate, final build |
| **W1 — Shader** | blackhole.frag, fullscreen.vert, grid.frag | Core physics: geodesic eqs, RK4, disk, starfield |
| **W2 — Renderer** | renderer.ts, uniforms.ts | WebGL2 setup, shader compile, fullscreen quad, textures |
| **W3 — Camera/UI** | camera.ts, controls.ts | Orbital camera, mouse/touch, UI sliders, FPS |
| **QA** | tests/*.ts, validation scripts | Physics verification, perf benchmarks, edge cases, visual checks |

## Core Physics (Geometrized Units: G=1, c=1)

### Key Radii
- Schwarzschild radius: `rs = 2M`
- Photon sphere: `r_ph = 3M` (= 1.5 × rs)
- ISCO (inner disk edge): `r_isco = 6M` (= 3 × rs)

### Geodesic Equations
```
d²φ/dλ² = -(2/r) · (dr/dλ) · (dφ/dλ)
d²r/dλ² = -(rs)/(2r²) + r · (dφ/dλ)²
```

### RK4 Integration
```
k1 = h·f(y)
k2 = h·f(y + k1/2)
k3 = h·f(y + k2/2)
k4 = h·f(y + k3)
y_next = y + (k1 + 2k2 + 2k3 + k4)/6
```

### Fragment Shader Ray Marching (per pixel)
1. Pixel → NDC → ray direction via u_invViewProjection
2. Init polar coords (r, φ) relative to BH at origin
3. RK4 loop (u_maxSteps iterations):
   - r < rs → black (absorbed)
   - Ray crosses disk plane & r ∈ [r_isco, r_outer] → disk color
   - r > escape_radius → sample starfield
4. Apply gravitational redshift: `sqrt(1 - rs/r)`
5. Output color with tone mapping

## Uniform Contract (W1 shaders ↔ W2 renderer)
```
u_resolution          vec2      canvas size
u_cameraPos           vec3      camera world position
u_invViewProjection   mat4      inverse view-projection matrix
u_mass                float     BH mass (default 1.5)
u_time                float     elapsed time
u_maxSteps            int       ray march iterations
u_stepSize            float     RK4 step size
u_showDisk            bool→int  accretion disk toggle
u_showGrid            bool→int  grid mode toggle
u_starfield           sampler2D texture unit 0
```

## QA Verification Criteria

### Physics Correctness
- [ ] Photon sphere: rays at r=3M with tangential velocity orbit ≥1 loop
- [ ] Event horizon: all rays with r<rs produce black output
- [ ] Shadow size: BH shadow ≈ 5.2M (analytical Schwarzschild shadow radius)
- [ ] Disk symmetry: face-on view is radially symmetric
- [ ] Einstein ring: point source directly behind BH produces ring

### Rendering
- [ ] No shader compilation errors/warnings
- [ ] Uniform names match between .frag and renderer.ts
- [ ] Canvas resize updates resolution correctly
- [ ] Starfield renders when disk is off

### Performance
- [ ] ≥30 FPS at 0.5x resolution, steps=1000 on mid-range GPU
- [ ] ≥60 FPS at 0.25x resolution
- [ ] No memory leaks over 5 minutes
- [ ] Step count slider responsive without freezing

### Edge Cases
- [ ] mass = 0 → no lensing (straight rays)
- [ ] mass very large (100) → mostly black
- [ ] steps = 1 → no crash
- [ ] Camera at r < rs → graceful fallback
- [ ] Window resize / mobile viewport

## Build & Run
```bash
npm install
npm run dev      # Dev server
npm run build    # Production
npm run test     # QA validation suite
```
