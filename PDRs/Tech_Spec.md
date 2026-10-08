# 智伴方舟高校版技术规范

本文件为当前实现概览，不替代 OpenAPI 字段定义；完整请求/响应约束查看后端 `/docs` 或 `/openapi.json`。验收状态见 [Delivery_Playbook](Delivery_Playbook.md)。

## 目录结构

`backend/main.py` 为 FastAPI 入口；`auth.py`、`database.py`、`schemas.py`、`llm_service.py`、`asr_service.py`、`tts_service.py` 按职责拆分。`frontend/src/app/chat` 为学生端，`frontend/src/app/admin` 为工作端，`frontend/src/lib/api.ts` 统一处理 JWT 请求。

## 核心接口

**运维**

- `GET /`、`GET /health`

**认证**

- `POST /api/auth/c-login`、`POST /api/auth/c-register`、`POST /api/auth/c-logout`
- `POST /api/auth/b-login`、`POST /api/auth/b-register`、`POST /api/auth/b-logout`
- `GET /api/auth/c-me`、`GET /api/auth/b-me` 为当前双端身份接口；`GET /api/auth/me` 仅作兼容

登录成功后写入 HttpOnly Cookie（`c_token` / `b_token`），同时返回 token 供前端存储；`prod` 环境下 Cookie 带 `secure` 标记。

同源请求使用 Cookie；显式配置 `NEXT_PUBLIC_API_BASE` 才使用对应端本地 token，不回退到另一端。middleware 仅做页面入口与退出 Cookie 清理，API 权限由后端校验。401/退出使用分端退出标记，由 Next 清除 HttpOnly Cookie；退出 API 等待上限 3 秒。JWT 无状态，退出不代表撤销已复制的令牌。

注册密码至少 6 字符，bcrypt 输入不超过 72 个 UTF-8 字节；账号 trim 后非空。已有短密码登录仍兼容。管理员注册要求邀请码和 `G` 加三位数字，当前页面没有注册入口。

**对话与语音**

- `POST /api/chat/stream`、`POST /api/chat/stream-sse`
- `GET /api/chat/history`（`limit` 1-200，默认 50）、`DELETE /api/chat/history`
- `POST /api/asr/transcribe`、`POST /api/tts`

当前聊天页面调用 `/api/chat/stream`，返回 `{reply, risk_assessment}`，不是流式响应。请求可带 `companion_persona`、`campus_context`；身份以 JWT 为准，不信任客户端 `user_id`。SSE 接口完整生成后按 12 字符切片发 delta/done，当前页面不消费它。历史清除、TTS 也不能当作现有页面入口。

ASR 输入为 multipart `file`，项目支持 WAV/MP3 后缀，默认大小上限 26214400 字节；返回 `{text}`。聊天输入区采集并封装 WAV，成功回填后需确认发送。空音频 400、大小超限 413、格式不支持 415、未配置/供应商失败 502。服务端并未独立实现完整音频时长校验，供应商规则另行核对。

前端 JSON 请求时限默认 15 秒、聊天 75 秒、ASR 45 秒；包含响应正文读取。历史成功前禁止发送，失败保留输入并提供重试。发送失败会恢复草稿，不自动重发；数据库写入并非完整对话事务，错误后人工重发不能保证服务端恰好一次，必要时先刷新检查历史。

**工作端**

- `GET /api/admin/alerts`（`limit` 1-500，默认 100）、`POST /api/admin/alerts/{event_id}/handle`
- `GET /api/admin/stats`、`GET /api/admin/users`
- `GET /api/admin/users/{user_id}/activity`、`GET /api/admin/users/{user_id}/interventions`
- `GET /api/admin/risk-trend`、`GET /api/admin/risk-tags`

**工具**

- `GET /api/weather`、`GET /api/exam-countdown`、`GET /api/scenario/context`

前两项仅是兼容接口；当前页面只用 context 获取治愈语、来源及求助资源，不含天气/倒计时。每日治愈外部来源失败会降级为本地文案，不承诺每次刷新都得到新句子。

所有聊天和管理查询固定使用 `scenario=university`。服务端拒绝其他场景值，并在 JWT 校验时重新读取数据库角色。

## 风险评估

`llm_service._risk()` 对单条消息做关键词匹配及有限完整片段排除，风险等级不由 LLM 文本决定。红色优先于黄色；分值取决于命中标签类别数（不是词出现次数）：

| 等级 | 规则概述 | 分值 |
| --- | --- | --- |
| red | 轻生念头/自伤危险标签 | `min(98, 92 + (标签数 - 1) * 3)`；现有两类为 92 或 95 |
| yellow | 睡眠、焦虑、低落、学业、孤独标签 | `min(80, 60 + (标签数 - 1) * 5)` |
| green | 以上均未命中 | 10 |

`dev_override` 为 `yellow_alert` / `red_alert` 时可跳过 LLM 直接返回预设剧本，仅在 `APP_ENV != prod` 时生效。

调试剧本的 yellow/red 分值为 65/95，和普通规则路径不同；prod 拒绝任何非空 `dev_override`（包括 `normal`）。35 条样例及边界见 [Risk_Rule_Acceptance](Risk_Rule_Acceptance.md)，不代表医学验证。真实模型收到分级提示词，但不保证每次回复完全服从；黄色离线回复不虚构症状。

## 数据与安全

SQLite 启用 WAL、外键和参数化查询。密码使用 bcrypt，生产环境必须配置长度至少 32 位的 `JWT_SECRET`。CORS 在 `prod` 下只允许 `ALLOWED_ORIGINS` 精确匹配并禁止 `ALLOW_ANY_ORIGIN`；开发环境在未配置 `ALLOWED_ORIGINS` 时回退为匹配任意 host 的正则。旧数据库扩展字段仅为迁移兼容保留，不再参与新业务流程。

数据为 `users`、`chat_messages`、`risk_events` 等 SQLite 表，普通聊天也留存，只有黄/红生成风险事件。重复跟进不覆盖第一次处理记录。单校权限模型没有按学校隔离多个租户；未完成生产安全审计。

## 配置与验证

`DB_PATH` 未设置时使用后端目录数据库，显式空值不是默认路径。LLM 密钥/地址/模型分别优先读 `LLM_*`，空值回退 `ZHIPU_*`，模型最终默认 `glm-5.3-flash`；显式配置应保证供应商三者匹配。LLM 取历史最多为 API 的 `CHAT_HISTORY_WINDOW`，模型层仍截最近 10 条。ASR 使用 `ZHIPU_*`，TTS 使用 `MIMO_*`。

Next 同源 `/api` rewrite 使用构建/启动前配置的 `API_UPSTREAM`；公网可由 Nginx 直接转发。`skipMiddlewareUrlNormalize` 防止本地 IP 重定向被规范化为 localhost；代理仍需保留外部 Host/协议。日常 dev/build 共用 `.next`，验证入口单独使用 `.next-verify`。

运行 `python scripts/verify_project.py` 生成临时库、服务日志、JSON/Markdown 报告及截图；正常退出停止本次服务并检查端口，不清理产物。外部 LLM 离线兜底、ASR/治愈语替身不计为供应商验收。部署不生成 WAR，详见 [部署说明](../deploy/README.md)。
