# 智伴方舟项目指南

## 删除操作约束

- 删除文件、目录或数据库对象前，必须列出精确路径/对象、说明原因，并等待用户回复“确认”。
- 禁止使用通配符批量删除；数据库历史数据默认保留。
- 单个文件编辑或覆盖不属于删除，无需额外确认。

## 项目范围

本项目仅支持高校心理陪伴场景：学生端角色为 `student`，工作端为 G 类 `admin`，AI 人设可选择“知心学姐/知心学长”。旧数据库中的非高校记录仅作兼容保留，不得进入新业务流程。

后续迭代先读 `PDRs/Delivery_Playbook.md`：它定义交付成果、阶段任务、功能验收矩阵和当前证据。当前按单校部署验收，不宣称已经具备多校数据隔离。

## 技术栈

- 后端：Python 3.12、FastAPI、PostgreSQL（`DATABASE_URL`）、JWT HS256、bcrypt。
- 前端：Next.js 15、React 18、TypeScript、Tailwind、Shadcn UI。
- AI：对话走 OpenAI 兼容的 `LLM_*`；未配置密钥时使用高校心理关键词兜底。ASR 走智谱 `ZHIPU_*`，TTS 走小米 MiMo `MIMO_*`（未配置时返回 502）。

## 目录结构

`backend/main.py` 为 API 入口；`auth.py` 负责鉴权，`database.py` 负责 PostgreSQL CRUD（经 `db.py` 连接池），`llm_service.py` 负责模型调用、关键词风险判定和兜底，`schemas.py` 负责对话与风险模型（`ChatRequest` / `RiskAssessment` / `ChatResponse`），登录注册的请求模型直接定义在 `main.py`。前端页面位于 `frontend/src/app`，统一请求封装位于 `frontend/src/lib/api.ts`。

学生端主要组件在 `frontend/src/app/chat/_components/`。其中 `ReleaseTools.tsx` 仍引用 `chat/components/EmotionShredder.tsx`；不能将整个 `chat/components/` 判定为无引用。`test-login/` 为历史页面，兼容代码只提不删。

## 关键账号

数据库初始为空。只有 `backend/.env` 设 `SEED_DEMO_USERS=1` 并在之后重启后端，启动钩子才会注入学生 `001 / 123456` 与管理员 `G001 / 123456`；未设置该变量时不要假设这些账号存在。

## 验证命令

```powershell
python -m py_compile backend/main.py backend/auth.py backend/database.py backend/schemas.py
cd frontend
npm run lint
```

`npm run build` 与 `npm run dev` 共用 `frontend/.next`，dev server 运行期间执行 build 会导致页面请求 500。需要 build 时先停 dev，跑完重启 dev。

完整隔离验收：`python scripts/verify_project.py`。使用临时数据库、随机本机端口和 `.next-verify` 构建目录；报告与截图保留在输出的 `ARTIFACTS` 目录。外部 LLM 为离线兜底、ASR/每日治愈为测试替身，不算供应商实调通过。运行结束只停止测试启动的服务，不删除产物。旧 `frontend/scripts/ui_release_check.py` 已转发到此安全入口。
