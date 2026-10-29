import type {
  CampusTermPhase,
  CampusTimeContext,
  CompanionPersona,
} from "@/app/chat/_components/types";

export const COMPANION_PERSONA_KEY = "ark_companion_persona";
export const DEFAULT_COMPANION_PERSONA: CompanionPersona = "senior_sister";

export function companionName(persona: CompanionPersona) {
  return persona === "senior_brother" ? "知心学长" : "知心学姐";
}

export function readCompanionPersona(account?: string): CompanionPersona {
  if (typeof window === "undefined") return DEFAULT_COMPANION_PERSONA;
  try { return account && localStorage.getItem(`${COMPANION_PERSONA_KEY}:${account}`) === "senior_brother"
    ? "senior_brother"
    : DEFAULT_COMPANION_PERSONA; } catch { return DEFAULT_COMPANION_PERSONA; }
}

export function saveCompanionPersona(persona: CompanionPersona, account?: string): boolean {
  try {
    if (!account) return false;
    localStorage.setItem(`${COMPANION_PERSONA_KEY}:${account}`, persona);
    return true;
  } catch { return false; }
}

function termPhase(month: number): CampusTermPhase {
  if ([1, 5, 6, 12].includes(month)) return "exam_season";
  if ([2, 3, 9].includes(month)) return "term_start";
  if ([7, 8].includes(month)) return "break";
  return "term_time";
}

export function buildCampusTimeContext(now = new Date()): CampusTimeContext {
  return {
    local_hour: now.getHours(),
    weekday: now.getDay(),
    phase: termPhase(now.getMonth() + 1),
  };
}

type Greeting = {
  eyebrow: string;
  title: string;
  description: string;
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const PHASE_LABELS: Record<CampusTermPhase, string> = {
  term_start: "开学适应期",
  term_time: "学期进行中",
  exam_season: "考试 / DDL 季",
  break: "假期节奏",
};

function pick(items: string[], seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return items[hash % items.length];
}

export function buildCampusGreeting(
  now: Date,
  persona: CompanionPersona,
  identity = "student",
): Greeting {
  const context = buildCampusTimeContext(now);
  const name = companionName(persona);
  const isWeekend = context.weekday === 0 || context.weekday === 6;
  const seed = `${identity}-${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${context.local_hour}-${persona}`;

  let periodLabel = "校园时刻";
  let titles: string[];

  if (context.local_hour < 5) {
    periodLabel = "深夜陪伴";
    titles = [
      `这么晚还没休息吗？${name}在。`,
      `夜已经很深了，先把心事放到这里吧。`,
    ];
  } else if (context.phase === "exam_season") {
    periodLabel = "备考时段";
    titles = [
      "如果最近在赶 DDL，别急着一次扛完。",
      "如果正在复习，也可以先喘口气。",
      "若临近考试，也不用把自己逼成满分。",
    ];
  } else if (context.local_hour < 8) {
    periodLabel = "清晨时段";
    titles = ["早八启动中？先给今天留一点余量。", "新的一天加载中，不用一开场就满格。"];
  } else if (context.local_hour < 12) {
    periodLabel = isWeekend ? "周末上午" : "上午时段";
    titles = isWeekend
      ? ["周末也可以慢半拍，今天想聊点什么？", "先听听自己的状态吧。"]
      : ["来透口气吗？这里不用抢答。", "上午过得怎么样？想听你说说。"];
  } else if (context.local_hour < 14) {
    periodLabel = "午间休息";
    titles = ["午饭吃了吗？先别让情绪也空着肚子。", "中场休息一下，今天上午还顺利吗？"];
  } else if (context.local_hour < 18) {
    periodLabel = isWeekend ? "周末下午" : "下午时段";
    titles = ["下午容易掉电，来这里补一格能量吧。", "课程、作业、人际，哪一件最占内存？"];
  } else if (context.local_hour < 22) {
    periodLabel = "晚间时段";
    titles = ["晚课或自习结束了吗？今天也很努力。", "今天的待办先放一放，心情也值得被看见。"];
  } else {
    periodLabel = "夜间陪伴";
    titles = ["刚从图书馆卷完回来吗？辛苦啦。", "今天的 DDL 先告一段落，轮到你照顾自己了。"];
  }

  return {
    eyebrow: `${WEEKDAYS[context.weekday]} · ${periodLabel} · ${PHASE_LABELS[context.phase]}（月份推测）`,
    title: pick(titles, seed),
    description: `${name}会跟着你的节奏聊。时间提示基于设备时间和月份，未接入个人课表或学校校历。可以只说一句“我有点累” 🙂`,
  };
}


/** COMP-06：写入服务端人设；失败时由调用方保留本地降级提示。 */
export async function saveCompanionPersonaRemote(persona: CompanionPersona): Promise<boolean> {
  try {
    const { apiJson } = await import("@/lib/api");
    await apiJson<{ success: boolean }>("/api/auth/c-preferences", {
      method: "PATCH",
      side: "c",
      body: { companion_persona: persona },
    });
    return true;
  } catch {
    return false;
  }
}

export function normalizeCompanionPersona(value: unknown): CompanionPersona {
  return value === "senior_brother" ? "senior_brother" : DEFAULT_COMPANION_PERSONA;
}
