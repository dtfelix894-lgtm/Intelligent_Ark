"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api";
import { CrisisSupportCard, buildCrisisFromHelp } from "./CrisisSupportCard";
import { HelpResources } from "./HelpResources";
import {
  GAD7_BANDS,
  GAD7_INTRO,
  GAD7_ITEMS,
  LIKERT_OPTIONS,
  NON_DIAGNOSIS_DISCLAIMER,
  PHQ9_BANDS,
  PHQ9_INTRO,
  PHQ9_ITEMS,
  bandFor,
  type ScaleItem,
} from "./scaleItems";
import { CbtThoughtRecord } from "./CbtThoughtRecord";
import { EmotionDiary } from "./EmotionDiary";
import { PsychoEducation } from "./PsychoEducation";
import type { CrisisSupport, HelpResourcesConfig } from "./types";

type ScaleKind = "phq9" | "gad7";

type SavedResult = {
  kind: ScaleKind;
  score: number;
  answers: number[];
  bandLabel: string;
  q9?: number;
  at: string;
};

const STORAGE_KEY = "ark_self_assess_last_v1";

function loadSaved(): Partial<Record<ScaleKind, SavedResult>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<ScaleKind, SavedResult>>;
  } catch {
    return {};
  }
}

function saveResult(result: SavedResult) {
  try {
    const prev = loadSaved();
    prev[result.kind] = result;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
  } catch {
    /* private mode */
  }
}

function ScaleRunner({
  kind,
  title,
  intro,
  items,
  bands,
  maxScore,
  onBack,
  onOpenHelp,
}: {
  kind: ScaleKind;
  title: string;
  intro: string;
  items: ScaleItem[];
  bands: typeof PHQ9_BANDS;
  maxScore: number;
  onBack: () => void;
  onOpenHelp?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => items.map(() => null));
  const [done, setDone] = useState(false);
  const [crisis, setCrisis] = useState<CrisisSupport | null>(null);
  const [crisisLoading, setCrisisLoading] = useState(false);

  const score = useMemo(
    () => answers.reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0),
    [answers],
  );
  const q9 = kind === "phq9" ? answers[8] : null;
  const band = bandFor(score, bands);
  const showCrisis = kind === "phq9" && typeof q9 === "number" && q9 > 0;
  const showHelpBlock = showCrisis || band.helpLevel === "mid" || band.helpLevel === "high";

  useEffect(() => {
    if (!showCrisis) {
      setCrisis(null);
      return;
    }
    let cancelled = false;
    setCrisisLoading(true);
    void apiJson<HelpResourcesConfig>("/api/help-resources", { side: "c" })
      .then((hr) => {
        if (!cancelled) setCrisis(buildCrisisFromHelp(hr));
      })
      .catch(() => {
        if (!cancelled) {
          setCrisis({
            message:
              "你选到了与自我伤害相关的想法。请立刻联系身边可信任的人或学校心理中心，不要独自硬撑。这不是诊断，但值得被认真对待。",
            resources: [],
            appointment: null,
            configured: false,
            is_placeholder: false,
            missing_hint: "求助资源暂未配置或加载失败。请打开「帮助」页重试，或直接联系学校心理中心、辅导员或身边可信任的人。",
            trust_prompt: "现在就告诉身边信任的人。",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCrisisLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showCrisis, q9]);

  function choose(value: number) {
    const next = [...answers];
    next[step] = value;
    setAnswers(next);

    // PHQ-9 第 9 题（index 8）>0：作答当下立即拉危机支持
    const hitCritical = kind === "phq9" && items[step]?.critical && value > 0;

    if (step >= items.length - 1) {
      const finalScore = next.reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
      const finalBand = bandFor(finalScore, bands);
      saveResult({
        kind,
        score: finalScore,
        answers: next.map((v) => (typeof v === "number" ? v : 0)),
        bandLabel: finalBand.label,
        q9: kind === "phq9" ? (next[8] as number) : undefined,
        at: new Date().toISOString(),
      });
      setDone(true);
      return;
    }

    if (hitCritical) {
      // 仍继续后续题目，但危机卡会在结果区/当前页顶部出现
    }
    setStep((s) => s + 1);
  }

  // 答题过程中若已答第9题>0，顶部即时危机条
  const midCrisis = kind === "phq9" && typeof answers[8] === "number" && (answers[8] as number) > 0 && !done;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        返回自测列表
      </button>

      <div className="rounded-2xl border border-violet-100 bg-violet-50/80 p-3 text-xs leading-5 text-violet-950">
        <p className="font-semibold">{title}</p>
        <p className="mt-1">{NON_DIAGNOSIS_DISCLAIMER}</p>
      </div>

      {midCrisis && (
        <div className="space-y-2">
          {crisisLoading && !crisis ? (
            <p className="text-sm text-red-800">正在加载危机支持资源…</p>
          ) : null}
          {crisis ? (
            <CrisisSupportCard
              support={crisis}
              onOpenHelp={onOpenHelp}
              title="需要立刻被支持"
              className="mt-0"
            />
          ) : null}
        </div>
      )}

      {!done ? (
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs font-semibold text-muted-foreground">
            第 {step + 1} / {items.length} 题
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-violet-600 transition-[width]"
              style={{ width: `${((step + 1) / items.length) * 100}%` }}
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{intro}</p>
          <p className="mt-4 text-base font-semibold leading-7 text-foreground">{items[step].text}</p>
          {items[step].critical ? (
            <p className="mt-2 text-xs leading-5 text-red-800">
              若你现在有伤害自己的想法，请先寻求现实支持。继续作答不会代替求助。
            </p>
          ) : null}
          <div className="mt-4 space-y-2">
            {LIKERT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => choose(opt.value)}
                className="ark-interactive flex min-h-12 w-full items-center rounded-xl border border-border bg-secondary/40 px-3 text-left text-sm font-semibold hover:bg-secondary active:scale-[0.99]"
              >
                <span className="mr-3 grid h-8 w-8 place-items-center rounded-lg bg-white text-xs text-primary">
                  {opt.value}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">自测结果</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {score}
              <span className="ml-1 text-base font-semibold text-muted-foreground">/ {maxScore}</span>
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">{band.label}</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{NON_DIAGNOSIS_DISCLAIMER}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              结果仅保存在本机浏览器，仅本人可见。
            </p>
            <button
              type="button"
              onClick={() => {
                setAnswers(items.map(() => null));
                setStep(0);
                setDone(false);
                setCrisis(null);
              }}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              重新作答
            </button>
          </div>

          {showCrisis && (
            <div>
              {crisisLoading && !crisis ? (
                <p className="text-sm text-red-800">正在加载危机支持资源…</p>
              ) : null}
              {crisis ? (
                <CrisisSupportCard support={crisis} onOpenHelp={onOpenHelp} title="PHQ-9 第 9 题提示" className="mt-0" />
              ) : null}
            </div>
          )}

          {showHelpBlock && !showCrisis && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-950">建议看看求助资源</p>
              <p className="mt-1 text-xs leading-5 text-amber-900">
                分档偏中高时，优先联系现实支持。以下为学校配置的帮助入口（非诊断建议）。
              </p>
              <div className="mt-3">
                <HelpResources />
              </div>
            </div>
          )}

          {showHelpBlock && showCrisis && (
            <div className="rounded-2xl border border-border bg-white p-3">
              <p className="mb-2 text-sm font-semibold">更多帮助入口</p>
              <HelpResources />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Props = { onOpenHelp?: () => void };

export function SelfAssessPanel({ onOpenHelp }: Props) {
  const [mode, setMode] = useState<"hub" | ScaleKind>("hub");
  const [saved, setSaved] = useState<Partial<Record<ScaleKind, SavedResult>>>({});

  useEffect(() => {
    setSaved(loadSaved());
  }, [mode]);

  if (mode === "phq9") {
    return (
      <ScaleRunner
        kind="phq9"
        title="PHQ-9 情绪自测"
        intro={PHQ9_INTRO}
        items={PHQ9_ITEMS}
        bands={PHQ9_BANDS}
        maxScore={27}
        onBack={() => setMode("hub")}
        onOpenHelp={onOpenHelp}
      />
    );
  }

  if (mode === "gad7") {
    return (
      <ScaleRunner
        kind="gad7"
        title="GAD-7 焦虑自测"
        intro={GAD7_INTRO}
        items={GAD7_ITEMS}
        bands={GAD7_BANDS}
        maxScore={21}
        onBack={() => setMode("hub")}
        onOpenHelp={onOpenHelp}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-violet-700" aria-hidden="true" />
          <h3 className="font-semibold text-violet-950">自测 · 日记 · 科普</h3>
        </div>
        <p className="mt-2 text-xs leading-5 text-violet-900">{NON_DIAGNOSIS_DISCLAIMER}</p>
      </div>

      <button
        type="button"
        onClick={() => setMode("phq9")}
        className="ark-interactive flex min-h-16 w-full flex-col items-start rounded-xl border border-border bg-white px-3 py-3 text-left hover:bg-secondary/50"
      >
        <span className="text-sm font-semibold">PHQ-9 情绪自测</span>
        <span className="mt-1 text-xs text-muted-foreground">9 题 · 过去两周 · 这不是诊断</span>
        {saved.phq9 ? (
          <span className="mt-2 text-[11px] text-muted-foreground">
            上次本机结果：{saved.phq9.score} 分（{saved.phq9.bandLabel}）
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => setMode("gad7")}
        className="ark-interactive flex min-h-16 w-full flex-col items-start rounded-xl border border-border bg-white px-3 py-3 text-left hover:bg-secondary/50"
      >
        <span className="text-sm font-semibold">GAD-7 焦虑自测</span>
        <span className="mt-1 text-xs text-muted-foreground">7 题 · 过去两周 · 这不是诊断</span>
        {saved.gad7 ? (
          <span className="mt-2 text-[11px] text-muted-foreground">
            上次本机结果：{saved.gad7.score} 分（{saved.gad7.bandLabel}）
          </span>
        ) : null}
      </button>

      <p className="text-[11px] leading-4 text-muted-foreground">
        量表结果仅本人本机可见。这不是诊断；中文版最终以学校心理中心确认为准。
      </p>

      <div className="border-t border-border pt-4">
        <CbtThoughtRecord />
      </div>

      <div className="border-t border-border pt-4">
        <EmotionDiary />
      </div>

      <div className="border-t border-border pt-4">
        <PsychoEducation />
      </div>
    </div>
  );
}
