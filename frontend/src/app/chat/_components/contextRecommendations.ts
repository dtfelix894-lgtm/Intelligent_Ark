import type { ChatMessage } from "./types";

export type ToolFocus = "sleep" | "tips" | "breathe" | "shredder" | "typing" | "help";

export type ContextSignal =
  | "sleep"
  | "exam"
  | "sad"
  | "anxiety"
  | "lonely"
  | "anger";

export type ToolRecommendation = {
  id: string;
  signal: ContextSignal;
  title: string;
  reason: string;
  tab: "relax" | "release" | "help";
  focus: ToolFocus;
  priority: number;
};

type Rule = {
  signal: ContextSignal;
  patterns: RegExp[];
  title: string;
  reason: string;
  tab: ToolRecommendation["tab"];
  focus: ToolFocus;
  priority: number;
};

const RULES: Rule[] = [
  {
    signal: "sleep",
    patterns: [/睡不着/, /失眠/, /入睡困难/, /整夜/, /熬夜/, /翻来覆去/, /睡眠/, /噩梦/, /眼睁睁/],
    title: "正念入睡",
    reason: "对话里提到睡眠困扰，适合先做呼吸引导并听轻柔垫底音。",
    tab: "relax",
    focus: "sleep",
    priority: 100,
  },
  {
    signal: "exam",
    patterns: [/考试/, /期末/, /考研/, /复习/, /\bddl\b/i, /DDL/, /作业(堆|太多|做不完)/, /论文/, /挂科/, /绩点/],
    title: "学业解压锦囊",
    reason: "提到学业压力，可以先拿一条现在做得到的小建议。",
    tab: "relax",
    focus: "tips",
    priority: 90,
  },
  {
    signal: "sad",
    patterns: [/想哭/, /哭了/, /难过/, /伤心/, /委屈/, /崩溃/, /心情低落/, /提不起劲/, /心好累/],
    title: "情绪碎纸机",
    reason: "情绪有点沉，写下来再亲手放下，会轻松一点。",
    tab: "release",
    focus: "shredder",
    priority: 95,
  },
  {
    signal: "anxiety",
    patterns: [/焦虑/, /紧张/, /慌/, /害怕/, /心悸/, /喘不过气/, /坐立不安/, /担心死了/],
    title: "呼吸引导",
    reason: "身体有些紧绷，跟着圆圈呼吸把节奏放慢。",
    tab: "relax",
    focus: "breathe",
    priority: 92,
  },
  {
    signal: "lonely",
    patterns: [/孤独/, /一个人/, /没人懂/, /没人理/, /被冷落/, /孤单/],
    title: "打字发泄墙",
    reason: "想说的话可以先写在这里，只留在本页。",
    tab: "release",
    focus: "typing",
    priority: 80,
  },
  {
    signal: "anger",
    patterns: [/生气/, /愤怒/, /烦死了/, /火大/, /受够了/, /很烦/],
    title: "打字发泄墙",
    reason: "先把火气打出来，再决定要不要继续聊。",
    tab: "release",
    focus: "typing",
    priority: 85,
  },
];

function collectText(messages: ChatMessage[], limit = 8): string {
  const recent = messages.filter((m) => m.role === "user").slice(-limit);
  return recent.map((m) => m.content || "").join("\n");
}

/** 根据近期用户消息生成情境推荐（最高优先在前，最多 3 条）。 */
export function buildToolRecommendations(messages: ChatMessage[]): ToolRecommendation[] {
  const text = collectText(messages);
  if (!text.trim()) return [];

  const matched: ToolRecommendation[] = [];
  for (const rule of RULES) {
    if (!rule.patterns.some((re) => re.test(text))) continue;
    matched.push({
      id: `${rule.signal}-${rule.focus}`,
      signal: rule.signal,
      title: rule.title,
      reason: rule.reason,
      tab: rule.tab,
      focus: rule.focus,
      priority: rule.priority,
    });
  }

  matched.sort((a, b) => b.priority - a.priority);
  const seen = new Set<string>();
  const unique: ToolRecommendation[] = [];
  for (const item of matched) {
    const key = `${item.tab}:${item.focus}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 3) break;
  }
  return unique;
}
