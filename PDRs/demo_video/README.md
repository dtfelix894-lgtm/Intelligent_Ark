# 智伴方舟 — 闭环演示视频物料

本目录存放「项目闭环演示视频」的全部交付物料与给 **codex** 的执行指令。
目标：由 codex 用 **Playwright 自动驱动浏览器 + 录屏**，跑通全功能闭环并导出一段 **mp4**。

## 文件清单

| 文件 | 用途 | 给谁看 |
|------|------|--------|
| `CODEX_INSTRUCTIONS.md` | **主指令**：codex 的任务书。环境准备、要写的脚本、成功判据、交付路径、护栏 | codex |
| `STORYBOARD.md` | **分镜脚本**：逐镜头操作清单 + 旁白解说 + 真实 UI 锚点 + 断言 | codex / 你 |
| `output/ark_demo.mp4` | codex 产出的最终视频（运行后生成，已 gitignore 建议） | 你 |

## 一句话流程

> 高校生注入红码 → B 端大屏预警池实时弹出 → 查看脱敏摘要与风险评分 → 标记安全并结案（落库）→ 闭环✓；
> 再演示社区端语音输入(ASR) + 神经语音朗读(TTS) + 适老化，覆盖 B2B2C 双轨。

## 给 codex 的最短上手

```
读 PDRs/demo_video/CODEX_INSTRUCTIONS.md，按其中的步骤准备环境并写 Playwright 录制脚本，
镜头与旁白严格照 PDRs/demo_video/STORYBOARD.md 执行，最终产出 PDRs/demo_video/output/ark_demo.mp4。
```

## 现有可复用资产

- `../screenshots/` — 已截好的 C/B 端各场景静帧（可作片头/片尾或封面）
- `../PRD.md` / `../Tech_Spec.md` / `../UI_Spec.md` — 产品/接口/UI 规范
- 项目根 `README.md` 的「路演操作指南」— 闭环步骤的人工版说明
