# 交给 Cursor 的迭代指令（直接复制下面整段）

```text
你是智伴方舟高校版的全栈开发与测试工程师。本轮任务：按 PDRs/PRD_v2.md 实现 Iteration 1（闭环夯实，端到端可演示），只做 I1，不做 I2/I3。

【开始前必读】
1. PDRs/PRD_v2.md（重点：第 3 节现状、第 5 节闭环与状态机、第 6 节需求、第 10 节验收与演示、第 11 节 I1 范围与任务顺序、第 13 节开放问题）
2. AGENTS.md、CLAUDE.md、GLOSSARY.md、docs/adr/ 下全部 ADR、PDRs/Delivery_Playbook.md、PDRs/Risk_Rule_Acceptance.md
3. 动手前先核对 PRD_v2 中写“（推断）”的地方和真实代码是否一致；不一致以代码为准，并在报告里说明。

【硬性约束】
- ADR 优先：风险事件保持消息级、存储不去重（ADR 0001）；工作台只展示脱敏摘要，任何接口和页面都不能带出学生消息原文（ADR 0002）。PRD_v2 第 13 节的冲突项一律不要自行改变决定。
- 术语严格使用 GLOSSARY.md；PRD_v2 第 4.3 节的新术语在本轮补进 GLOSSARY。
- 风险规则 llm_service._risk() 的等级、标签、分数和 35 条样例结果本轮不改。
- 数据库只新增表/列，迁移幂等；不修改、不删除历史数据；测试只用临时库/内存库，不碰 backend/intelligent_ark.db。删除任何文件、目录或数据库对象前，按 AGENTS.md 列出精确对象和原因，等我回复“确认”。
- 不在代码里写死任何求助电话；求助资源、响应时限等走环境变量（PRD_v2 ADM-02），并注意 CLAUDE.md 说的 .env 加载顺序问题。密钥不写进代码、文档、日志或测试报告。
- 不调用计费模型；外部 LLM/ASR 用现有替身，并在报告中标明。

【保护工作区里我未提交的改动】
- 先运行 git status 和 git diff --stat，把已有未提交改动记下来。
- 禁止 git reset --hard、git checkout -- <文件>、git stash、git clean、强制推送，禁止覆盖或回退这些改动。
- 需要修改的文件如果已经有我未提交的改动，就在它的基础上继续改，并在报告里单独列出这些文件。

【工作方式】
- 按 PRD_v2 第 11 节 I1-01 → I1-09 的顺序推进。按 PDRs/Delivery_Playbook.md 的约定，是否创建提交由我决定：本轮不要 git commit，改动留在工作区，在报告里按任务编号列出每个任务改了哪些文件。
- 每个任务：核对现状 → 先写/补测试 → 最小范围实现 → 跑相关测试 → 再跑核心闭环。发现 P0/P1 缺陷先修，不继续堆功能。
- 修改页面时检查键盘操作、中文输入法、375px/390px/横屏/桌面宽度，以及加载/空/失败三态，沿用现有视觉风格。

【每个任务后，以及全部完成后要跑的验证】
1. python -m py_compile backend/main.py backend/auth.py backend/database.py backend/schemas.py backend/llm_service.py
2. 在 backend 目录运行 python -m unittest test_contracts test_release test_risk_language（如某个文件不是 unittest 形式，按 scripts/verify_project.py 里的调用方式运行）
3. cd frontend && npm run lint；需要 build 时先停掉 dev server（.next 共用），build 完再重启 dev
4. 最终必须 python scripts/verify_project.py 退出码 0。知情同意弹窗、F08 口径变化会影响 scripts/browser_acceptance.py、scripts/preference_acceptance.py、scripts/interaction_acceptance.py、scripts/acceptance_server.py，请同步更新这些脚本，不要用 mock 核心 API 的方式让测试通过。
5. 按 PRD_v2 第 10.2 节演示脚本自己走一遍，保留截图。

【文档】
更新 GLOSSARY.md、PDRs/Tech_Spec.md、PDRs/UI_Spec.md、README.md（接口表和环境变量）、PDRs/Risk_Rule_Acceptance.md（结案标注回流流程）、deploy/backend.env.example；在 docs/adr/ 新增一份“风险事件跟进状态机与响应时限”ADR；PDRs/PRD.md 开头加一句指向 PRD_v2；在 PDRs/Delivery_Playbook.md 第 8 节追加本轮台账（任务 ID、改动、证据路径、未验证项）；起草《数据留存与删除策略》草案（只写文档，不执行任何删除）。

【完成后给我的报告】
1. 已完成：逐条列出 PRD_v2 需求编号，对应任务编号、改动文件、测试结果。
2. 未完成 / 降级：需求编号、原因、建议。
3. 验证证据：各命令结果、scripts/verify_project.py 输出的 REPORT 路径、演示截图位置。
4. 原本就有我未提交改动、你又在上面继续修改的文件清单。
5. 核对后发现与 PRD_v2 不符的地方（尤其是 PRD 第 13 节 Q14：/api/admin/users/{user_id}/activity 和 /interventions 是否返回原文）。
6. 剩余风险和下一步建议（I2 前需要我决定的开放问题）。
不要把替身、未执行或被环境阻塞的检查写成“通过”。
```
