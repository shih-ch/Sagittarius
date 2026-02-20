# Sagittarius — Real-Time Black Hole Simulation

基於廣義相對論的即時黑洞模擬器，在瀏覽器中使用 WebGL2 片段著色器進行光線追蹤。
A real-time black hole simulator based on General Relativity, using WebGL2 fragment shader ray marching in the browser.

![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Vite](https://img.shields.io/badge/Vite-7.3-purple)
![WebGL2](https://img.shields.io/badge/WebGL2-GPU%20Accelerated-green)

## Features / 功能一覽

### Core Physics / 核心物理

| Feature | Description |
|---------|-------------|
| **Schwarzschild Metric** | 史瓦西度規光線追蹤，RK4 數值積分 |
| **Kerr Metric** | 克爾旋轉黑洞，支援自旋參數 a/M = 0 ~ 0.99 |
| **Gravitational Lensing** | 引力透鏡效應，背景星場/網格扭曲 |
| **Accretion Disk** | 吸積盤渲染，Novikov-Thorne 溫度分佈，開普勒差動旋轉 |
| **Doppler Beaming** | 相對論性都卜勒聚束效應 I = D⁴·I₀ |
| **Gravitational Redshift** | 引力紅移 z = √(1 - rs/r) |
| **Einstein Ring** | 愛因斯坦環，可調光源位置 |
| **Relativistic Jets** | 相對論性噴流（Blandford-Znajek 機制） |

### Advanced Physics Visualization / 進階物理可視化

| Feature | Key | Description |
|---------|-----|-------------|
| **Ergosphere** | G | 克爾黑洞能層邊界可視化（藍紫色區域） |
| **Tidal Force Map** | — | 潮汐力色圖 F = 2M/r³（綠→黃→紅） |
| **Gravitational Waves** | W | 四極子引力波星場扭曲效果 |
| **Temperature Map** | — | Novikov-Thorne 溫度分佈 viridis 色圖 |
| **Polarization Map** | — | 同步輻射偏振方向，循環色相編碼 |
| **Time Dilation** | — | 引力時間膨脹色圖 dτ/dt = √(1 - rs/r) |

### Educational / Interactive / 教育互動

| Feature | Key | Description |
|---------|-----|-------------|
| **Guided Tour** | O | 9 步自動導覽，含相機動畫與雙語解說 |
| **Formula Panel** | P | KaTeX 即時渲染的物理公式面板 |
| **EHT Comparison** | — | 真實 EHT 觀測影像（M87* / Sgr A*）疊加比較 |
| **Geodesic Tracer** | T | 點擊追蹤光線在彎曲時空中的完整路徑 |
| **Newton vs GR** | N | 牛頓重力與廣義相對論光線偏折對比 |
| **Particle Orbits** | — | 有質量粒子軌道模擬（圓形/橢圓/墜落） |
| **Penrose Process** | — | 能層內能量提取過程模擬 |
| **Science Panel** | E | 完整黑洞物理學中英文教學 |
| **Bilingual UI** | 中/EN | 全介面中英文切換 |

### Rendering / 渲染

- 4 種色彩模式：預設熱輻射 / 科學溫度 / 電影 / X-ray
- Bloom 輝光後處理效果
- 可調解析度（0.25x ~ 1.0x）、FOV、RK4 步數/步長
- 截圖（PNG）與錄影（WebM）
- 全螢幕模式

## Keyboard Shortcuts / 快捷鍵

| Key | 功能 | Function |
|-----|------|----------|
| H | 控制面板 | Control panel |
| I | 物理資訊 | Physics info |
| E | 教學面板 | Science panel |
| F | 全螢幕 | Fullscreen |
| S | 截圖 | Screenshot |
| R | 錄影 | Record |
| T | 光線追蹤 | Ray trace |
| D | 都卜勒 | Doppler |
| C | 色彩模式 | Color mode |
| J | 噴流 | Jets |
| B | 輝光 | Bloom |
| N | 牛頓比較 | Newton compare |
| G | 能層 | Ergosphere |
| W | 引力波 | Grav. waves |
| P | 公式面板 | Formula panel |
| O | 導覽 | Guided tour |

Mouse: drag to rotate, scroll to zoom.

## Installation / 安裝

### Prerequisites / 環境需求

- [Node.js](https://nodejs.org/) >= 18
- npm >= 9 (included with Node.js)
- A modern browser with WebGL2 support (Chrome, Firefox, Edge, Safari 15+)

### Setup / 安裝步驟

```bash
# Clone the repository / 複製專案
git clone <repository-url>
cd sagittarius

# Install dependencies / 安裝依賴
npm install

# Start development server / 啟動開發伺服器
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build / 建置

```bash
# Type check + production build / 型別檢查 + 正式建置
npm run build

# Preview production build / 預覽正式版
npm run preview
```

### Test / 測試

```bash
# Run test suite / 執行測試
npm run test
```

## Tech Stack / 技術棧

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.9 |
| Bundler | Vite 7.3 |
| Rendering | WebGL2 Fragment Shader Ray Marching |
| Math | [gl-matrix](https://github.com/toji/gl-matrix) 3.4 |
| Formulas | [KaTeX](https://katex.org/) 0.16 (dynamic import) |
| Testing | [Vitest](https://vitest.dev/) 3.0 |

## Project Structure / 專案結構

```
sagittarius/
├── index.html                      # Canvas + UI + Science panel
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── images/
│       ├── eht-m87.jpg             # EHT M87* observation (CC BY 4.0)
│       └── eht-sgra.jpg            # EHT Sgr A* observation (CC BY 4.0)
├── src/
│   ├── main.ts                     # App bootstrap & render loop
│   ├── types.ts                    # Shared interfaces
│   ├── camera.ts                   # Orbital camera (mouse/touch/animation)
│   ├── controls.ts                 # UI panel bindings & keyboard shortcuts
│   ├── renderer.ts                 # WebGL2 engine & bloom pipeline
│   ├── uniforms.ts                 # Uniform management
│   ├── geodesic-tracer.ts          # GR null geodesic tracer (click-to-trace)
│   ├── newton-tracer.ts            # Newtonian comparison tracer
│   ├── particle-tracer.ts          # Timelike geodesic & Penrose process
│   ├── trajectory-panel.ts         # 2D orbital plane diagram
│   ├── trajectory-overlay.ts       # 3D trajectory overlay
│   ├── formula-panel.ts            # KaTeX formula panel
│   ├── eht-overlay.ts              # EHT observation image overlay
│   ├── tour.ts                     # Guided educational tour
│   ├── math/
│   │   └── constants.ts            # Physics constants & Kerr radii
│   └── shaders/
│       ├── fullscreen.vert         # Fullscreen quad vertex shader
│       ├── blackhole.frag          # Core ray marching fragment shader
│       ├── grid.frag               # Spacetime grid shader
│       ├── bloom-extract.frag      # Bloom bright-pass extraction
│       ├── blur.frag               # Gaussian blur (bloom)
│       └── composite.frag          # Final compositing (bloom)
└── tests/
    ├── physics.test.ts             # Physics correctness tests
    ├── visual-benchmark.ts         # Visual regression helper
    ├── perf.test.ts                # Performance benchmarks
    └── edge-cases.test.ts          # Edge case validation
```

## Physics / 物理原理

### Geometrized Units / 幾何化單位

All calculations use geometrized units where G = c = 1. In this system:

- Schwarzschild radius: `rs = 2M`
- Photon sphere: `r_ph = 3M`
- ISCO: `r_isco = 6M` (Schwarzschild), decreases with Kerr spin
- Shadow radius: `r_shadow = 3√3 M ≈ 5.2M`
- Ergosphere: `r_ergo(θ) = M + √(M² - a²cos²θ)`

### Geodesic Equations / 測地線方程

Null geodesics (light paths) in Schwarzschild spacetime:

```
d²r/dλ² = (r - 3M) · (dφ/dλ)²
d²φ/dλ² = -(2/r) · (dr/dλ) · (dφ/dλ)
```

Integrated via 4th-order Runge-Kutta (RK4) per pixel in the GPU fragment shader.

### Kerr Metric / 克爾度規

The Kerr metric describes rotating black holes with spin parameter `a = J/M`:

- Event horizon: `r₊ = M + √(M² - a²)`
- Prograde photon sphere: `r_ph = 2M(1 + cos(2/3 · arccos(-a/M)))`
- Prograde ISCO: computed via Bardeen's Z₁/Z₂ formula

### Novikov-Thorne Temperature / 溫度分佈

```
T(r) = T₀ · (r_isco/r)^(3/4) · [1 - √(r_isco/r)]^(1/4)
```

Peak temperature ~6.3 × 10⁶ K for a 10 M☉ stellar-mass black hole.

## References / 參考資料

### Original Implementation

- [kavan010/black_hole](https://github.com/kavan010/black_hole) — Original C++/OpenGL black hole simulation that inspired this project

### Textbooks & Papers / 教科書與論文

- **Misner, Thorne, Wheeler** — *Gravitation* (1973). Comprehensive GR reference for geodesic equations and black hole physics
- **Hartle, J.B.** — *Gravity: An Introduction to Einstein's General Relativity* (2003). Accessible introduction to GR
- **Chandrasekhar, S.** — *The Mathematical Theory of Black Holes* (1983). Detailed treatment of Kerr metric and photon orbits
- **Novikov, I.D. & Thorne, K.S.** — "Astrophysics of Black Holes" in *Black Holes* (1973). Thin accretion disk temperature model
- **Bardeen, J.M., Press, W.H., Teukolsky, S.A.** — "Rotating Black Holes: Locally Nonrotating Frames, Energy Extraction, and Scalar Synchrotron Radiation" *ApJ* 178, 347 (1972). ISCO derivation for Kerr
- **Penrose, R.** — "Gravitational Collapse: The Role of General Relativity" *Rivista del Nuovo Cimento* 1, 252 (1969). Penrose energy extraction process
- **Blandford, R.D. & Znajek, R.L.** — "Electromagnetic Extraction of Energy from Kerr Black Holes" *MNRAS* 179, 433 (1977). Relativistic jet mechanism

### EHT Observations / 事件視界望遠鏡觀測

- **Event Horizon Telescope Collaboration** — "First M87 Event Horizon Telescope Results. I." *ApJL* 875, L1 (2019)
- **Event Horizon Telescope Collaboration** — "First Sagittarius A* Event Horizon Telescope Results. I." *ApJL* 930, L12 (2022)
- **Event Horizon Telescope Collaboration** — "First M87 Event Horizon Telescope Results. VII. Polarization" *ApJL* 910, L12 (2021)

### Visualization References / 可視化參考

- **James, O., von Tunzelmann, E., Franklin, P., Thorne, K.S.** — "Gravitational Lensing by Spinning Black Holes in Astrophysics, and in the Movie *Interstellar*" *Class. Quantum Grav.* 32, 065001 (2015). Ray tracing techniques for Kerr black holes
- **Luminet, J.-P.** — "Image of a Spherical Black Hole with Thin Accretion Disk" *A&A* 75, 228 (1979). First computed black hole image

### Image Credits / 圖片授權

- M87* EHT observation image: EHT Collaboration, [ESO/eso1907a](https://www.eso.org/public/images/eso1907a/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Sgr A* EHT observation image: EHT Collaboration, [ESO/eso2208-eht-mwa](https://www.eso.org/public/images/eso2208-eht-mwa/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Browser Compatibility / 瀏覽器相容性

| Browser | Support |
|---------|---------|
| Chrome 80+ | Full |
| Firefox 80+ | Full |
| Edge 80+ | Full |
| Safari 15+ | Full |

Requires WebGL2 support. A dedicated GPU is recommended for smooth performance at higher resolutions.

## Performance Tips / 效能建議

- Lower resolution (0.25x–0.5x) for smooth frame rates on integrated GPUs
- Reduce RK4 steps (500–1000) for faster rendering
- Disable bloom when not needed
- Narrow FOV reduces ray count per frame

## License

MIT
