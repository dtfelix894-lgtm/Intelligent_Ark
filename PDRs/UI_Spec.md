# 智伴方舟 — UI 设计与组件规范文档 (UI_Spec)

> **文档版本:** v3.0（基于已实现版本逆向整理）
> **最后更新:** 2026-04

---

## 1. 设计系统基础

### 1.1 技术约束

- 样式：**100% TailwindCSS 原子类**，禁止手写内联 style（动画除外）。
- 组件：**Shadcn UI** 作为基础组件库（Button/Card/Input/Badge/Avatar/ScrollArea/Sheet/Dialog/Tabs/Separator/DropdownMenu/Toast）。
- 图标：**Lucide React**（统一来源，禁止混用其他图标库）。
- 图表：**Recharts**（LineChart/PieChart）。

### 1.2 全局调色板

**C端（治愈陪伴风）**

| 用途 | Token |
|------|-------|
| 主背景 | `bg-stone-50` |
| 气泡/卡片 | `bg-white` |
| 主品牌色 | `bg-orange-400` |
| 淡品牌背景 | `bg-orange-100` |
| 主文本 | `text-stone-800` |
| 次文本 | `text-stone-500` |

**B端（严肃科技风）**

| 用途 | Token |
|------|-------|
| 主背景 | `bg-slate-50` |
| 卡片 | `bg-white shadow-sm` |
| Header/关键按钮 | `bg-slate-900 text-white` |
| 工单悬停 | `hover:bg-slate-100 transition-colors` |

**预警状态语义色（全局通用）**

| 级别 | 边框 | 背景 | 徽标 |
|------|------|------|------|
| 🔴 红码（高危） | `border-red-500` | `bg-red-50` | `bg-red-500 text-white` |
| 🟡 黄码（关注） | `border-amber-400` | `bg-amber-50` | `bg-amber-500 text-white` |
| 🟢 绿码（常态） | `border-emerald-500` | `bg-emerald-50` | `bg-emerald-500 text-white` |

---

## 2. 页面路由总览

| 路由 | 功能 | 布局约束 |
|------|------|----------|
| `/` | 落地页/首页 | 全屏 |
| `/login` | C端登录/注册 | 居中卡片 |
| `/admin-login` | B端登录/注册 | 居中卡片 |
| `/chat` | C端聊天主页 | 三列或移动端单列 |
| `/admin` | B端管理大屏 | PC全屏 12列 Grid |

---

## 3. C端登录页（`/login`）

**布局：** `min-h-screen flex items-center justify-center bg-stone-50`

**登录Tab：** 学号登录（student）/ QQ邮箱登录（social），Tabs 组件切换。

**注册入口：** 页面底部文字链接，点击展开注册表单（RegisterForm.tsx）。

**注册表单字段：**
- student：账号（学号）、密码、学校名称、学历
- social：QQ邮箱、密码

---

## 4. B端登录页（`/admin-login`）

**布局：** `min-h-screen flex items-center justify-center bg-slate-900`（深色背景）

**Tab切换：** 登录（AdminLoginForm）/ 注册（AdminRegisterForm）

**注册字段：** 工号（G/C + 3位数字）、密码、管理员类型（高校G/社区C）、学校名称（G型必填）、邀请码。

**安全控件：** `SliderCaptcha` 滑块验证码，防机器暴力登录。

---

## 5. C端聊天页（`/chat`）

### 5.1 整体布局

**PC端（宽屏）：**
```
+------------------+---------------------------+------------------+
|  左侧面板        |       聊天区域            |    右侧面板      |
|  (LeftPanel)     |     max-w-md mx-auto      |   (RightPanel)   |
|  w-72, hidden    |   h-screen flex flex-col  |   w-72, hidden   |
|  on mobile       |                           |   on mobile      |
+------------------+---------------------------+------------------+
```

**移动端：** 仅显示中间聊天区域，左右面板收起为 Sheet 侧拉抽屉，通过顶部 Header 按钮触发。

### 5.2 聊天区域组件结构

```
Header（h-14, bg-white, shadow-sm）
  ← 返回  |  [Avatar] 智伴小方 (在线)  |  [菜单按钮]
  -- 连续点击 Avatar 3次（3秒内）弹出 Dev Panel --

ScrollArea（flex-1, bg-stone-50, p-4）
  AI气泡：左对齐，bg-white, rounded-2xl rounded-tl-none, border
  用户气泡：右对齐，bg-orange-400, text-white, rounded-2xl rounded-tr-none
  -- 快捷回复按钮（仅消息为空时显示，横向滚动） --

Footer（p-4, bg-white, border-t）
  [输入框 Input] + [发送按钮 Button]
  -- community 模式：增加语音输入切换按钮（微信风格） --
```

### 5.3 Dev Panel（路演控制台）

- **触发：** 连续 3 次点击 AI 头像（3 秒内重置计数）
- **样式：** `fixed bottom-0 w-full max-w-md bg-slate-900 text-white p-4 rounded-t-xl z-50`
- **4 个按钮（2×2 Grid）：**
  - `▶️ 正常聊天`（dev_override: normal）
  - `⚠️ 注入黄码：连续失眠`（dev_override: yellow_alert）
  - `🚨 注入红码：轻生倾向`（dev_override: red_alert）
  - `🔄 重置系统状态`（清空 localStorage + 刷新页面）

### 5.4 场景左侧面板（LeftPanel.tsx）

**University 模式（CampusWidgets）：**
- 天气卡片（调用 `/api/scenario/context`）
- 考研/考试倒计时（醒目大数字 + "天后"文字）
- 每日励志语（按日期轮换）
- 心理援助热线（一键拨打链接）

**Community 模式（CommunityWidgets）：**
- 天气卡片 + 今日日期/星期
- 日程提醒列表（5条，带时间和 emoji 图标，可勾选完成）
- 社区急救/服务热线

### 5.5 高校专属功能（右侧面板 / 浮动按钮）

**能量补给电台（Sheet 侧拉）：**
- 曲目列表：勋章（鹿晗）/ Lemon Tree / 钢琴纯音
- 播放控制：点击播放/暂停，与正念放松站互斥
- 音频节点：`<audio>` 预挂载，Callback Ref 统一管理

**解压锦囊（Dialog 弹窗）：**
- 4 个 Tab：呼吸调节 🌬️ / 身体活动 🏃 / 情绪记录 📝 / 生活小确幸 ☕
- 每个 Tab 内 4 条技巧文字 + 外部链接（Headspace/B站/Gratitude Journal/喜马拉雅）

**赛博解压游戏（全屏覆盖层）：**
- 木鱼（muyu）：点击增加计数，有音效反馈
- 气泡戳戳（bubble）：点击消除气泡小游戏

### 5.6 社区专属功能

**字号缩放：**
- 4档：0.9×（小）/ 1.0×（标准）/ 1.15×（大，默认）/ 1.3×（超大）
- 通过 CSS `font-size` 动态设置根元素/容器 style

**称呼偏好（首次使用引导 Dialog）：**
- 选择"爷爷"或"奶奶"，存入 state
- 所有 AI 消息中"爷爷/奶奶"被替换为对应称呼

**TTS 朗读（浏览器原生 SpeechSynthesis）：**
- 每条 AI 消息右下角显示 🔊 图标
- 点击触发 `window.speechSynthesis.speak()`，再次点击停止
- 当前朗读消息 id 高亮标记

**语音输入（仅 community 模式）：**
- 底部输入栏新增 Mic 切换按钮，切换为"按住说话"模式
- 按住：通过 Web Audio API（AudioContext + ScriptProcessorNode）采集 PCM 音频
- 抬手：PCM 数据封包为 WAV 格式（加 WAV Header），POST 到 `/api/asr/transcribe`
- 识别结果填入输入框自动发送
- 上滑 > 50px 视为"上滑取消"，丢弃录音

**SOS 紧急求助（底部固定按钮）：**
- 红色圆形浮动按钮，点击展开 Sheet
- 显示：急救 120（一键拨打）+ 社区热线 + 用户填写的家人电话
- 家人电话：可在设置中绑定，存入 state/localStorage

**老友收音机（CommunityWidgets）：**
- 3 个频道：京剧片段 🎭 / 评书 📖 / 健康知识 🎙️
- 与能量电台互斥，同时只能播放一路音频

**消息定时提醒：**
- 预置提醒时间（如 08:00 服药）
- 到时在聊天流中自动插入提示卡片（不触发 API 调用）

---

## 6. B端管理大屏（`/admin`）

### 6.1 整体布局

```
+-------------------------------------------------------------------------------------+
| Header（h-16, bg-slate-900, text-white）                                           |
|  🛡️ 智伴方舟 - 情绪治理底座    [管理员姓名/类型]  [退出登录]                        |
+-------------------------------------------------------------------------------------+
| Stats Bar（flex gap-4, px-6, my-4）                                                 |
| [👥 监控总人数] [🔴 今日红码] [🟡 今日黄码]                                         |
+-------------------------------------------------------------------------------------+
| Grid 12 内容区（grid-cols-12 gap-6 px-6）                                          |
|                                                                                     |
| 【col-span-4】          【col-span-5】                  【col-span-3】             |
| 实时预警工单池           宏观情绪态势                    干预闭环操作台             |
| ScrollArea h-[700px]    折线图(周风险走势) h-[320px]    sticky top-20              |
|                          饼图(标签分布)  h-[320px]                                  |
+-------------------------------------------------------------------------------------+
```

### 6.2 实时预警工单池

**数据来源：**
1. 首先调用 `GET /api/admin/alerts?scenario=<admin_type_scenario>` 拉取持久化事件
2. 同时监听 `window.addEventListener('storage', ...)` 的 `latest_ark_alert` key 变化
3. 新事件从列表顶部插入，附带 `animate-in fade-in slide-in-from-top-2` 动画

**卡片结构：**
```
+--- border-l-4 [red/amber/emerald] bg-[red/amber/emerald]-50 rounded-lg p-3 ---+
| 🔴 张同学 (大三)                               [2026-04-22 14:30]             |
|──────────────────────────────────────────────────────────────────────────────|
| 摘要：【AI脱敏摘要】该用户在深夜明确表达了强烈的绝望感...                    |
| 标签：[轻生念头 Badge] [极度绝望 Badge]                                       |
| 分数：95分                                                                    |
|                                               [查看详情 →]                    |
+------------------------------------------------------------------------------+
```

**已处理卡片：** `opacity-50 line-through`，移至列表底部或标记"已处理"。

### 6.3 数据可视化

**折线图（Recharts LineChart）：**
- X轴：周一 ~ 周日
- Y轴：风险指数（0-100）
- 数据：`MOCK_TREND.university` / `MOCK_TREND.community` 随场景切换

**饼图（Recharts PieChart）：**
- 颜色：`["#f59e0b", "#ef4444", "#10b981", "#3b82f6"]`
- 数据：`MOCK_TAGS.university` / `MOCK_TAGS.community`
- university：考研压力45% / 失眠焦虑30% / 人际冲突15% / 就业迷茫10%
- community：长时间未活动40% / 极度孤独30% / 防诈骗关注20% / 心率异常10%

### 6.4 干预闭环操作台

```
+--- Card: sticky top-20 h-[700px] ---+
| 🛠️ 干预闭环操作台                   |
|──────────────────────────────────── |
| 当前选中：张同学（红码/紧急）        |
| [极高风险 Badge destructive]         |
|                                     |
| 评估摘要：                           |
| 该生因压力导致长期睡眠剥夺...        |
|                                     |
| 风险标签：[轻生念头] [极度绝望]      |
| 评分：95                            |
|──────────────────────────────────── |
| 执行干预动作：                       |
| [📞 联系学生/辅导员 Button]           |
| [🏥 转介心理中心 Button]             |  <- university
| ── 或 ──                            |
| [📞 呼叫紧急联系人 Button]            |
| [🚨 派发网格员上门 Button]           |  <- community
|                                     |
| [✅ 标记安全并结案 Button outline]   |
+--------------------------------------+
```

点击"标记安全并结案"：
1. 调用 `POST /api/admin/alerts/{event_id}/handle`
2. 该工单从列表标记为"已处理"（卡片变灰）

---

## 7. 微交互与动画规范

| 场景 | 动画 |
|------|------|
| 新消息气泡出现 | `animate-in fade-in slide-in-from-bottom-2` |
| B端新预警卡片插入 | `animate-in fade-in slide-in-from-top-2` |
| 所有可点击卡片悬停 | `hover:bg-slate-100 transition-colors duration-150` |
| Dev Panel 弹出/收起 | `transition-transform duration-200` |
| 按钮悬停 | `hover:opacity-90 transition-opacity` |
| 气泡朗读中状态 | 脉冲边框 `animate-pulse ring-2 ring-orange-400` |

---

## 8. 响应式断点

| 断点 | 行为 |
|------|------|
| `< md`（移动端） | Chat 页仅显示中间聊天区；左右面板隐藏，通过 Sheet 触发 |
| `≥ md`（平板） | 两列布局（侧边栏 + 聊天区） |
| `≥ lg`（PC） | 三列完整布局（左面板 + 聊天区 + 右面板） |
| B端大屏 | 固定 PC 全屏，不做移动端适配 |
