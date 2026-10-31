/** 标准中文版条目与分档（学生自测）。 */

export type LikertOption = { value: 0 | 1 | 2 | 3; label: string };

export const LIKERT_OPTIONS: LikertOption[] = [
  { value: 0, label: "完全没有" },
  { value: 1, label: "有几天" },
  { value: 2, label: "一半以上天数" },
  { value: 3, label: "几乎每天" },
];

export type ScaleItem = { id: string; text: string; /** PHQ-9 第 9 题 */ critical?: boolean };

export const PHQ9_INTRO =
  "在过去两周内，你有多经常被以下问题所困扰？请按实际情况选择。";

export const PHQ9_ITEMS: ScaleItem[] = [
  { id: "phq1", text: "做事时提不起劲或没有乐趣" },
  { id: "phq2", text: "感到心情低落、沮丧或绝望" },
  { id: "phq3", text: "入睡困难、睡不安稳或睡眠过多" },
  { id: "phq4", text: "感觉疲倦或没有活力" },
  { id: "phq5", text: "食欲不振或吃太多" },
  { id: "phq6", text: "觉得自己很糟——或觉得自己很失败，或让自己或家人失望" },
  { id: "phq7", text: "对事物专注有困难，例如阅读报纸或看电视时" },
  { id: "phq8", text: "动作或说话速度缓慢到别人已经察觉？或正好相反——烦躁或坐立不安、动来动去更胜于平常" },
  { id: "phq9", text: "有不如死掉或用某种方式伤害自己的念头", critical: true },
];

export const GAD7_INTRO =
  "在过去两周内，你有多经常被以下问题所困扰？请按实际情况选择。";

export const GAD7_ITEMS: ScaleItem[] = [
  { id: "gad1", text: "感觉紧张、焦虑或急切" },
  { id: "gad2", text: "不能够停止或控制担忧" },
  { id: "gad3", text: "对各种各样的事情担忧过多" },
  { id: "gad4", text: "很难放松下来" },
  { id: "gad5", text: "由于不安而无法静坐" },
  { id: "gad6", text: "变得容易烦恼或急躁" },
  { id: "gad7", text: "感到似乎将有可怕的事情发生" },
];

export type Band = { min: number; max: number; label: string; helpLevel: "none" | "mild" | "mid" | "high" };

export const PHQ9_BANDS: Band[] = [
  { min: 0, max: 4, label: "0–4 · 情绪困扰不明显", helpLevel: "none" },
  { min: 5, max: 9, label: "5–9 · 轻度区间", helpLevel: "mild" },
  { min: 10, max: 14, label: "10–14 · 中度区间", helpLevel: "mid" },
  { min: 15, max: 19, label: "15–19 · 中重度区间", helpLevel: "high" },
  { min: 20, max: 27, label: "20–27 · 重度区间", helpLevel: "high" },
];

export const GAD7_BANDS: Band[] = [
  { min: 0, max: 4, label: "0–4 · 焦虑困扰不明显", helpLevel: "none" },
  { min: 5, max: 9, label: "5–9 · 轻度区间", helpLevel: "mild" },
  { min: 10, max: 14, label: "10–14 · 中度区间", helpLevel: "mid" },
  { min: 15, max: 21, label: "15–21 · 重度区间", helpLevel: "high" },
];

export function bandFor(score: number, bands: Band[]): Band {
  return bands.find((b) => score >= b.min && score <= b.max) || bands[bands.length - 1];
}

/** 自测页统一求助提示（避免重复技术/免责话术）。 */
export const SCALE_HELP_HINT =
  "若困扰持续或加重，请联系学校心理中心、辅导员或身边可信任的人。";
