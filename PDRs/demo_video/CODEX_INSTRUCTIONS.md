# CODEX 指令 · 智伴方舟闭环演示视频

> 你（codex）的任务：用 Playwright 自动驱动浏览器，跑通智伴方舟全功能闭环，**录制并导出一段 mp4 演示视频**。
> 镜头顺序、操作、旁白、断言一律以 `STORYBOARD.md` 为准。本文件负责环境、脚本框架、判据与护栏。

---

## 0. 成功判据（Definition of Done）

1. 生成文件 `PDRs/demo_video/output/ark_demo.mp4`，可正常播放，时长约 **2–4 分钟**。
2. 视频内**完整呈现闭环**：注入红码 → 大屏预警池出现该条 → 打开操作台看到脱敏摘要+风险分 → 点「标记安全并结案」→ 该卡片从待处理池消失（且后端 `risk_events` 已落库为已处理）。
3. 覆盖**全功能**：高校知心学姐对话 + 社区小暖对话 + 语音输入(ASR) + 神经语音朗读(TTS) + 适老化字号。
4. 过程零未捕获异常；每个关键镜头有 Playwright 断言通过（见 STORYBOARD「断言」列）。
5. 控制台/终端打印每一镜头的进度日志，便于复盘哪一步失败。

---

## 1. 环境准备（先做，按顺序）

### 1.1 启动后端（端口 8001）
```bash
cd backend
pip install -r requirements.txt
# 确认 .env：APP_ENV=dev（dev_override 才生效）；LLM_API_KEY 已填则对话走 DeepSeek，留空走关键词兜底（演示也能跑）
uvicorn main:app --port 8001 --host 127.0.0.1
```
健康检查：`GET http://127.0.0.1:8001/health` 应返回 `{"status":"ok"}`。
> 非 prod 启动会自动 seed 演示账号（001 / 002@qq.com / G001 / C001，密码均 123456）。

### 1.2 启动前端（端口 3000）
```bash
cd frontend
npm install
npm run dev   # next dev -H 0.0.0.0，访问 http://localhost:3000
```

### 1.3 安装 Playwright（Python 版，推荐）
```bash
pip install playwright
playwright install chromium
```

### 1.4 ffmpeg（webm→mp4 转码用）
- Playwright 原生录制输出 **webm**。转 mp4 需要 ffmpeg。
- 本机当前**未安装 ffmpeg**。安装：`winget install Gyan.FFmpeg`（或 choco/scoop）。
- 兜底：装不上 ffmpeg 时，直接交付 `ark_demo.webm` 并在交付说明里注明。

### 1.5 语音输入(ASR) 的假音频
应用录音链路是 Web Audio 采 PCM → 打包 WAV → `POST /api/asr/transcribe`（智谱 glm-asr）。
自动化时给 Chromium 喂一段**真实中文语音 wav**，让 ASR 能转写出文字：

- 启动参数（关键）：
  ```
  --use-fake-ui-for-media-stream
  --use-fake-device-for-media-stream
  --use-file-for-fake-audio-capture=<绝对路径>/demo_voice.wav
  ```
- `demo_voice.wav` 生成方式（任选其一）：
  1. 复用本项目 TTS：调 `POST /api/tts`（需 .env 里 `MIMO_API_KEY` 有值）合成「我最近一个人在家有点闷，想找人说说话」，再用 ffmpeg 转成 16k 单声道 wav；
  2. 用系统/任意 TTS 生成同句中文 wav。
- **若 ASR 自动化太脆弱**：降级为「展示按住说话的 UI 交互 + 旁白说明」，不强求真实转写文字落地（在 STORYBOARD ACT3 已标注降级分支）。

---

## 2. 录制脚本框架（Python Playwright）

放在 `PDRs/demo_video/record_demo.py`。要点：

- **单浏览器上下文、单标签、顺序导航** → 产出**一段连续 webm**（最稳，优先用这个）。
  闭环依然成立：注入红码后导航到 /admin，大屏从后端 `GET /api/admin/alerts?handled=false` 拉到该条，照样能结案。
- 录制开启方式：
  ```python
  context = browser.new_context(
      record_video_dir="PDRs/demo_video/output/_raw",
      record_video_size={"width": 1440, "height": 900},
      viewport={"width": 1440, "height": 900},
      locale="zh-CN",
  )
  ```
- 浏览器以 **headed**（`headless=False`）+ 上面的 fake-audio 启动参数运行；放慢节奏用 `slow_mo=350` 或在每步后 `page.wait_for_timeout(...)`，让镜头看得清。
- 旁白：用**屏幕字幕**呈现——在每镜头开始时通过 `page.add_style_tag` + 注入一个固定定位的字幕条 `<div>`，把 STORYBOARD 的「旁白」文字写进去（避免依赖外部配音）。提供一个 `caption(page, text)` 辅助函数统一渲染。
- 结束：`context.close()` 后 Playwright 才会把 webm 落盘；再用 ffmpeg：
  ```bash
  ffmpeg -i output/_raw/<hash>.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart output/ark_demo.mp4
  ```
- 可选进阶（**跨 Tab 实时预警**卖点）：开两个 page（/chat 与 /admin）做并排画面，注入红码后 admin 靠 `StorageEvent` 秒弹。实现复杂（需双视频 ffmpeg 并排合成），**默认不做**，时间富裕再加。

---

## 3. 关键 UI 锚点速查（真实文案，已核对代码）

| 位置 | 锚点 |
|------|------|
| 首页 `/` | 链接「进入 C端聊天」→/chat、「进入 B端大屏」→/admin |
| C端登录 `/login` | 一键填充演示账号；学生 `001`/`123456`(高校)、社会 `002@qq.com`/`123456`(社区) |
| B端登录 `/admin-login` | 工号输入(placeholder「例：G001」/「例：C001」)、密码(placeholder「请输入密码」)、按钮「安全登录」；角色切高校/社区 |
| 聊天输入框 | `<input>` placeholder 高校「有什么心事，说给我听听...」/ 社区「想聊什么就跟我说...」 |
| 语音切换 | 按钮 `aria-label` =「切换到语音输入」/「切换到键盘输入」(Mic 图标)；语音模式下出现「按住 说话」按钮 |
| 朗读(TTS) | 助手气泡上的喇叭(Volume2)按钮 |
| Dev Panel 触发 | 顶部 AI 头像，`title="连续点击3次呼出开发者工具"`，**3 秒内点 3 次** |
| Dev Panel 面板 | 标题「开发者路演快捷注入器」；按钮「🔥 注入红码（轻生倾向）」「⚠ 注入黄码（连续失眠）」「💚 注入绿码（情绪平稳）」 |
| 大屏 `/admin` | 统计卡「待处理红码」；预警池红/黄卡片；点卡片→右侧操作台显示脱敏摘要+风险评分 |
| 结案按钮 | 高校「标记安全并结案」/ 社区「确认安全并结案」；快捷动作「联系学生/辅导员」「呼叫紧急联系人」 |
| 闭环接口 | 结案触发 `POST /api/admin/alerts/{eventId}/handle` |

> 选择器优先用 `get_by_text` / `get_by_role(name=...)` / `get_by_placeholder` 匹配上述真实文案，避免脆弱的 CSS 路径。

---

## 4. 护栏（务必遵守）

- **只读演示，别改业务代码**。本任务不修复前端 lint 报错、不重构页面。如确需为录制加 `data-testid`，先停下来说明，不要擅自大改。
- **不删任何文件**。产物只写进 `PDRs/demo_video/output/`。中间 webm 放 `output/_raw/`。
- 用的是 dev 环境（`APP_ENV=dev`）；`.env` 里有真实 API Key，**不要把 key 打印进视频字幕或日志、不要外传**。
- 录制反复试错会往 `risk_events` 写很多条预警；演示用足够，但**不要去清库/删表**（如需重置请先询问人）。
- 失败就停下报告：贴出失败镜头编号、报错、最后一张截图，不要无脑重试刷库。
