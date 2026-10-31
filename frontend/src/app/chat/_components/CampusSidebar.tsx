"use client";

import { useEffect, useMemo, useState } from "react";
import { Quote, RefreshCw, Sparkles, SunMedium } from "lucide-react";
import { apiJson } from "@/lib/api";
import { buildCampusGreeting, buildCampusTimeContext, companionName } from "@/lib/campus-companion";
import { MoodCheckIn } from "./MoodCheckIn";
import type { CampusContext, CompanionPersona, CampusTermPhase } from "./types";

type Props = {
  persona?: CompanionPersona;
  school?: string;
  account?: string;
  studentId?: string;
};

const PHASE_META: Record<CampusTermPhase, { chip: string; tip: string }> = {
  term_start: { chip: "开学适应期", tip: "允许自己慢慢找节奏，不必一开始就满格。" },
  term_time: { chip: "学期进行中", tip: "小步前进也算进步，累了可以先停一下。" },
  exam_season: { chip: "考试 / DDL 季", tip: "先喘口气，再把任务拆小一点。" },
  break: { chip: "假期节奏", tip: "休息也是在充电，给自己留一点空白。" },
};

const PERIOD_HELLO: Record<string, string> = {
  late_night: "夜深了",
  dawn: "早上好",
  morning: "上午好",
  noon: "中午好",
  afternoon: "下午好",
  evening: "晚上好",
  night: "晚上好",
};

function periodBucket(hour: number) {
  if (hour < 5) return "late_night";
  if (hour < 8) return "dawn";
  if (hour < 12) return "morning";
  if (hour < 14) return "noon";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

/** 学号/账号脱敏：保留首尾，中间用 · 遮挡 */
function maskIdentity(raw?: string) {
  const text = (raw || "").trim();
  if (!text) return "同学";
  if (text.length <= 2) return `${text[0]}·`;
  if (text.length <= 4) return `${text.slice(0, 1)}··${text.slice(-1)}`;
  if (text.length <= 8) return `${text.slice(0, 2)}···${text.slice(-2)}`;
  return `${text.slice(0, 2)}····${text.slice(-2)}`;
}

function initials(label: string) {
  const text = label.trim();
  if (!text) return "同";
  const ch = text[0];
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
}

export function CampusSidebar({
  persona = "senior_sister",
  school,
  account,
  studentId,
}: Props) {
  const [data, setData] = useState<CampusContext | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  const greeting = useMemo(
    () => buildCampusGreeting(now, persona, studentId || account || "student"),
    [now, persona, studentId, account],
  );

  const maskedId = maskIdentity(studentId || account);
  const schoolLabel = school?.trim() || "高校陪伴空间";
  const phase = buildCampusTimeContext(now).phase;
  const phaseMeta = PHASE_META[phase];
  const hello = PERIOD_HELLO[periodBucket(now.getHours())];

  async function load() {
    try {
      setError("");
      setQuoteLoading(true);
      setData(await apiJson<CampusContext>("/api/scenario/context?scenario=university", { side: "c" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "校园信息暂时无法加载");
    } finally {
      setQuoteLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative space-y-4 pb-2">
      <div
        className="pointer-events-none absolute -left-4 -top-4 h-32 w-32 rounded-full bg-violet-200/35 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-6 top-48 h-28 w-28 rounded-full bg-emerald-200/25 blur-3xl"
        aria-hidden="true"
      />

      {/* 问候 / 身份 */}
      <section className="relative overflow-hidden rounded-2xl border border-violet-100/90 bg-gradient-to-br from-violet-50 via-white to-emerald-50/80 p-4 shadow-[0_10px_28px_rgba(76,29,149,0.05)]">
        <div className="flex items-start gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-800 text-base font-bold text-white shadow-sm ring-2 ring-white/80"
            aria-hidden="true"
          >
            {initials(studentId || account || "同学")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-violet-700/90">今日校园</p>
            <h2 className="mt-1 truncate text-lg font-bold leading-7 text-violet-950">
              {hello}，{maskedId}
            </h2>
            <p className="mt-0.5 truncate text-xs text-violet-800/75">{schoolLabel}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-violet-950">{greeting.title}</p>
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-violet-800/85">
          <SunMedium className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{greeting.eyebrow}</span>
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-violet-100/80 bg-white/70 px-2.5 py-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
          <p className="text-xs leading-5 text-muted-foreground">
            {companionName(persona)}在线 · 想说什么都可以
          </p>
        </div>
      </section>

      {/* 今日状态摘要 */}
      <section className="relative rounded-2xl border border-border/90 bg-white/95 p-4 shadow-[0_6px_20px_rgba(15,23,42,0.03)]">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold">今日状态摘要</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex min-h-8 items-center rounded-full border border-amber-100 bg-amber-50 px-2.5 text-xs font-semibold text-amber-950">
            {phaseMeta.chip}
          </span>
          <span className="inline-flex min-h-8 items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-950">
            可随时倾诉
          </span>
          <span className="inline-flex min-h-8 items-center rounded-full border border-violet-100 bg-violet-50 px-2.5 text-xs font-semibold text-violet-950">
            自助工具可用
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{phaseMeta.tip}</p>
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground/80">阶段按设备月份推测，未接入个人课表。</p>
      </section>

      <MoodCheckIn />

      {/* 每日治愈：独立加载态，不挡问候 */}
      <article className="relative rounded-2xl border border-emerald-100 bg-emerald-50/95 p-4 text-emerald-950 shadow-[0_6px_20px_rgba(6,95,70,0.04)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Quote className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <h3 className="text-sm font-semibold">每日治愈</h3>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={quoteLoading}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100/80 disabled:opacity-50"
            aria-label="刷新每日治愈"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${quoteLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            刷新
          </button>
        </div>

        {quoteLoading && !data ? (
          <div className="mt-3 space-y-2" aria-label="每日治愈加载中">
            <div className="h-4 animate-pulse rounded bg-emerald-200/60 motion-reduce:animate-none" />
            <div className="h-4 w-[85%] animate-pulse rounded bg-emerald-200/50 motion-reduce:animate-none" />
            <div className="h-4 w-[65%] animate-pulse rounded bg-emerald-200/40 motion-reduce:animate-none" />
          </div>
        ) : error && !data ? (
          <div className="mt-3">
            <p role="alert" className="text-sm leading-6 text-red-800">
              {error}
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              重新加载
            </button>
          </div>
        ) : (
          <>
            <blockquote className="mt-3 text-sm leading-7">
              “{data?.daily_quote || "允许一切发生，先照顾好自己。"}”
            </blockquote>
            {data?.daily_quote_source ? (
              <p className="mt-3 border-t border-emerald-200/80 pt-2 text-xs text-emerald-800">
                来源：{data.daily_quote_source}
              </p>
            ) : null}
            {error ? (
              <p className="mt-2 text-xs text-amber-800">上次刷新未成功，仍显示已有内容。</p>
            ) : null}
          </>
        )}
      </article>

    </div>
  );
}
