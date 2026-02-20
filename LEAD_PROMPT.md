你是 Sagittarius 黑洞模擬專案的 Lead。

## 第一步：讀取專案文件
請先讀完 CLAUDE.md 和 WORKFLOW.md，了解整個專案架構和物理規格。

## 第二步：Scaffold 專案
1. npm init -y
2. npm install vite typescript gl-matrix
3. 建立 tsconfig.json（target: ES2020, module: ESNext, strict: true）
4. 建立 vite.config.ts
5. 建立 index.html — 包含 <canvas id="gl-canvas"> 全屏 + 右上角半透明 UI 控制面板
   UI 元素 ID：#mass-slider, #mass-value, #steps-slider, #steps-value,
   #stepsize-slider, #toggle-disk, #toggle-grid, #resolution-select, #fps-display, #btn-reset
6. 建立 src/main.ts 骨架（import Camera, Renderer, Controls → init → requestAnimationFrame loop）
7. 確認 src/types.ts 和 src/math/constants.ts 已存在

## 第三步：啟動 Agent Team（4 個 Teammates）

### Teammate 1 — "shader"（Shader Engineer）
- 負責：src/shaders/fullscreen.vert, src/shaders/blackhole.frag, src/shaders/grid.frag
- 任務：GLSL 300 es fragment shader ray marching
  - 測地線方程（Christoffel symbols）+ RK4 積分
  - 吸積盤交叉檢測 + 溫度漸變著色
  - 等距長方投影星空背景取樣
  - 引力紅移：sqrt(1 - rs/r)
  - Reinhard tone mapping
- Uniform 名稱必須完全按照 CLAUDE.md 的 Uniform Contract

### Teammate 2 — "renderer"（Renderer Engineer）
- 負責：src/renderer.ts, src/uniforms.ts
- 任務：WebGL2 引擎
  - context 建立、shader 編譯/連結
  - Fullscreen quad（2 triangles）
  - 程序化星空紋理（2048×1024 canvas, 隨機白點）
  - Uniform 批次設定（名稱必須對齊 W1 shader）
  - Canvas resize 處理

### Teammate 3 — "camera"（Camera & UI Engineer）
- 負責：src/camera.ts, src/controls.ts
- 任務：
  - 軌道相機（球面座標 θ, φ, distance），gl-matrix 的 mat4/vec3
  - 滑鼠拖拽旋轉、滾輪縮放、觸控支援
  - getInvViewProjectionMatrix(aspect) → mat4（shader 需要）
  - UI 控制面板綁定（所有 slider/checkbox → BlackHoleParams）
  - FPS 顯示、H 鍵隱藏面板、Reset 按鈕

### Teammate 4 — "qa"（QA Engineer）
- 負責：tests/ 目錄
- 任務（等其他 3 人完成後）：
  - 物理驗證：事件視界吸收、光子球軌道、偏折角
  - Shader 編譯檢查 + uniform 名稱比對
  - 效能基準：不同解析度/steps 的 frame time
  - Edge cases：mass=0, steps=1, 相機進入事件視界
- 發現 bug 回報給 Lead，由 Lead 分派修復

## 規則
- 開啟 delegate mode — 你只做協調，不寫功能程式碼
- 所有 worker 完成後，你負責整合 + 修 import + 確保 npm run dev 正常
- 最終驗收：瀏覽器看到黑洞 + 扭曲星空 + 吸積盤 + 滑鼠互動
