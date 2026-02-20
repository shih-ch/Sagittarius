# Sagittarius — Getting Started Guide

## 📦 前置需求

```bash
# 1. 安裝 Claude Code (如果還沒裝)
npm install -g @anthropic-ai/claude-code

# 2. 安裝 tmux (Agent Teams 需要)
# macOS:
brew install tmux
# Ubuntu/Debian:
sudo apt install tmux

# 3. 安裝 Node.js 18+ (專案需要)
node --version  # 確認 ≥ 18

# 4. 登入 Claude Code
claude login
```

---

## 🚀 方式一：原生 Agent Teams（推薦）

這是 Claude Code 內建的多 agent 功能，Lead 自動管理 tmux pane，最乾淨。

### Step 1: 啟用 Agent Teams（實驗功能）

```bash
# 方法 A: 環境變數（本次 session）
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# 方法 B: 永久設定（寫入 settings.json）
# 編輯 ~/.claude/settings.json，加入：
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Step 2: 建立專案目錄並放入設定檔

```bash
# 建立專案
mkdir sagittarius && cd sagittarius

# 把下載的檔案放進來（CLAUDE.md 是關鍵）
# CLAUDE.md, WORKFLOW.md, src/types.ts, src/math/constants.ts
```

確認目錄結構：
```
sagittarius/
├── CLAUDE.md              ← Claude Code 會自動讀取這個
├── WORKFLOW.md
└── src/
    ├── types.ts
    └── math/
        └── constants.ts
```

### Step 3: 開啟 tmux 並啟動 Claude Code

```bash
# 先開 tmux（Agent Teams 會自動偵測並分割 pane）
tmux new-session -s sagittarius

# 在 tmux 裡啟動 Claude Code
claude
```

### Step 4: 給 Lead 初始指令

在 Claude Code 裡輸入以下 prompt：

```
你是 Sagittarius 黑洞模擬專案的 Lead。請讀完 CLAUDE.md 和 WORKFLOW.md，然後：

1. 先 scaffold 專案：npm init, 安裝 vite typescript gl-matrix，建立 tsconfig.json 和 vite.config.ts
2. 建立 index.html（含 canvas 和 UI 控制面板）
3. 建立 src/main.ts 骨架
4. 然後啟動一個 Agent Team，包含以下 4 個 teammates：

Teammate 1 - "shader" (W1-Shader Engineer):
  負責 src/shaders/fullscreen.vert, src/shaders/blackhole.frag, src/shaders/grid.frag
  核心任務：GLSL 300 es ray marching shader，實作測地線方程 + RK4 + 吸積盤 + 星空背景

Teammate 2 - "renderer" (W2-Renderer Engineer):
  負責 src/renderer.ts, src/uniforms.ts
  核心任務：WebGL2 引擎，shader 編譯，fullscreen quad，程序化星空紋理

Teammate 3 - "camera" (W3-Camera & UI):
  負責 src/camera.ts, src/controls.ts
  核心任務：軌道相機（球面座標），滑鼠/觸控操作，UI slider 綁定

Teammate 4 - "qa" (QA Engineer):
  負責 tests/ 目錄
  核心任務：物理正確性驗證、shader 編譯檢查、效能基準、edge case 測試
  注意：QA 等其他 3 個 worker 完成後才開始驗證

請開啟 delegate mode，只做協調不寫功能程式碼。
所有 uniform 名稱必須嚴格對齊（見 CLAUDE.md 的 Uniform Contract）。
```

### Step 5: 觀察 & 介入

```bash
# tmux 內切換 pane
Ctrl+B → 方向鍵

# 如果用 iTerm2 (macOS)，可用 tmux -CC 控制模式
# pane 會變成原生 tab，更好管理
```

**你的角色是「人類 Tech Lead」**：
- 觀察各 pane 進度
- 如果某個 agent 卡住，直接跟它說話
- 如果需要修正方向，跟 Lead agent 溝通
- 最關鍵的決策點：W1 的 shader 是否物理正確

---

## 🔧 方式二：手動 tmux（完全控制）

如果你想要更多控制權，或 Agent Teams 有問題：

### Step 1: 放入啟動腳本

把 `launch_agents.sh` 放到專案目錄。

### Step 2: 執行

```bash
cd sagittarius
chmod +x launch_agents.sh
./launch_agents.sh
```

腳本會：先寫 prompt 到 `.agent-prompts/` 目錄，建立 5 個 tmux pane，每個啟動 `claude` 並貼入對應 prompt。

如果自動貼上有問題（tmux paste 偶爾會出狀況），可以手動操作：
```bash
# 在任一 pane 裡手動啟動 claude 後，複製貼上 prompt：
cat .agent-prompts/lead.md      # 複製內容貼入 LEAD pane
cat .agent-prompts/w1-shader.md # 複製內容貼入 W1 pane
# ...以此類推
```

這會建立 5 個 tmux pane，每個各跑一個 `claude` instance：

```
┌──────────┬──────────┐
│   LEAD   │ W2-WebGL │
├──────────┼──────────┤
│ W1-GLSL  │ W3-UI    │
├──────────┴──────────┤
│         QA          │
└─────────────────────┘
```

### Step 3: 手動介入

```bash
# 切換 pane
Ctrl+B → 方向鍵

# 查看 worker 狀態
cat /tmp/sg_w1_status.txt
cat /tmp/sg_w2_status.txt
cat /tmp/sg_w3_status.txt
cat /tmp/sg_qa_status.txt

# 給 worker 下達額外指令（直接在該 pane 打字）

# 結束整個 session
tmux kill-session -t sagittarius
```

---

## ⚡ 關鍵注意事項

### Token 消耗
5 個 agent 同時跑會 **快速消耗 token**。預估：
- Lead: ~50K tokens
- 每個 Worker: ~100-200K tokens
- QA: ~50-100K tokens
- **總計約 500K-1M tokens**

建議：
- Workers 可用 Sonnet 模型省 token（在 Agent Teams 設定 `model: "sonnet"`）
- Lead 和 QA 用 Opus 確保品質

### Delegate Mode
在原生 Agent Teams 中，**一定要開 delegate mode**，否則 Lead 會自己跳下去寫 code 而不是協調。

### 最容易出錯的地方
1. **Uniform 名稱不一致** — W1 的 shader 和 W2 的 renderer 必須完全對齊
2. **GLSL 300 es 語法** — WebGL2 shader 有些限制（要宣告 precision，out 變數等）
3. **Camera 矩陣** — invViewProjectionMatrix 算錯會導致整個畫面不對

### 驗收標準
成功的標誌：
- [ ] `npm run dev` 啟動無錯誤
- [ ] 瀏覽器看到黑色圓形（黑洞）+　扭曲的星空背景
- [ ] 滑鼠拖拽可旋轉視角
- [ ] 開啟吸積盤後看到發光的環
- [ ] FPS ≥ 30（0.5x 解析度）

---

## 📁 檔案清單

確認你有這些檔案再開始：

| 檔案 | 用途 | 必要 |
|------|------|------|
| `CLAUDE.md` | 專案規格（Claude Code 自動讀取） | ✅ 必須 |
| `WORKFLOW.md` | 團隊流程參考 | 建議 |
| `src/types.ts` | 共享介面定義 | ✅ 必須 |
| `src/math/constants.ts` | 物理常數 | ✅ 必須 |
| `launch_agents.sh` | 手動 tmux 啟動腳本（方式二） | 可選 |
