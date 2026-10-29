"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

export type BreathPatternId = "478" | "box" | "calm";

type Phase = { id: "inhale" | "hold" | "exhale" | "hold_empty"; label: string; seconds: number; scale: number };

const PATTERNS: Record<BreathPatternId, { label: string; hint: string; phases: Phase[] }> = {
  "478": {
    label: "4-7-8",
    hint: "吸气 4 · 屏息 7 · 呼气 8",
    phases: [
      { id: "inhale", label: "吸气", seconds: 4, scale: 1.18 },
      { id: "hold", label: "屏息", seconds: 7, scale: 1.18 },
      { id: "exhale", label: "呼气", seconds: 8, scale: 0.82 },
    ],
  },
  box: {
    label: "方块呼吸",
    hint: "吸 4 · 屏 4 · 呼 4 · 停 4",
    phases: [
      { id: "inhale", label: "吸气", seconds: 4, scale: 1.15 },
      { id: "hold", label: "屏息", seconds: 4, scale: 1.15 },
      { id: "exhale", label: "呼气", seconds: 4, scale: 0.85 },
      { id: "hold_empty", label: "停顿", seconds: 4, scale: 0.85 },
    ],
  },
  calm: {
    label: "平稳呼吸",
    hint: "吸气 4 · 呼气 6",
    phases: [
      { id: "inhale", label: "吸气", seconds: 4, scale: 1.12 },
      { id: "exhale", label: "呼气", seconds: 6, scale: 0.86 },
    ],
  },
};

const DURATIONS = [1, 3, 5] as const;

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  /** compact：锦囊内嵌；full：正念站 */
  compact?: boolean;
  defaultPattern?: BreathPatternId;
  defaultMinutes?: (typeof DURATIONS)[number];
  className?: string;
};

export function BreathingGuide({
  compact = false,
  defaultPattern = "478",
  defaultMinutes = 3,
  className = "",
}: Props) {
  const [patternId, setPatternId] = useState<BreathPatternId>(defaultPattern);
  const [minutes, setMinutes] = useState<(typeof DURATIONS)[number]>(defaultMinutes);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(defaultMinutes * 60);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseLeft, setPhaseLeft] = useState(PATTERNS[defaultPattern].phases[0].seconds);
  const [scale, setScale] = useState(0.9);
  const raf = useRef<number | null>(null);
  const lastTs = useRef<number | null>(null);
  const phaseIndexRef = useRef(0);
  const phaseLeftRef = useRef(PATTERNS[defaultPattern].phases[0].seconds);
  const remainingRef = useRef(defaultMinutes * 60);
  const patternRef = useRef(PATTERNS[defaultPattern]);
  const pattern = PATTERNS[patternId];
  const phase = pattern.phases[phaseIndex] || pattern.phases[0];

  const totalSession = useMemo(() => minutes * 60, [minutes]);

  useEffect(() => {
    patternRef.current = PATTERNS[patternId];
  }, [patternId]);

  useEffect(() => {
    phaseIndexRef.current = phaseIndex;
  }, [phaseIndex]);

  useEffect(() => {
    if (!running) {
      lastTs.current = null;
      if (raf.current) cancelAnimationFrame(raf.current);
      return;
    }
    const tick = (ts: number) => {
      if (lastTs.current == null) lastTs.current = ts;
      const dt = Math.min(0.05, (ts - lastTs.current) / 1000);
      lastTs.current = ts;

      remainingRef.current -= dt;
      if (remainingRef.current <= 0) {
        remainingRef.current = 0;
        setRemaining(0);
        setRunning(false);
        return;
      }
      setRemaining(remainingRef.current);

      phaseLeftRef.current -= dt;
      const phases = patternRef.current.phases;
      if (phaseLeftRef.current <= 0) {
        const ni = (phaseIndexRef.current + 1) % phases.length;
        phaseIndexRef.current = ni;
        phaseLeftRef.current = phases[ni].seconds;
        setPhaseIndex(ni);
        setPhaseLeft(phases[ni].seconds);
      } else {
        setPhaseLeft(phaseLeftRef.current);
      }

      const target = phases[phaseIndexRef.current]?.scale ?? 1;
      setScale((current) => current + (target - current) * Math.min(1, dt * 1.8));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [running]);

  function reset(nextMinutes = minutes, nextPattern = patternId) {
    setRunning(false);
    setMinutes(nextMinutes);
    setPatternId(nextPattern);
    const nextRemaining = nextMinutes * 60;
    const firstPhase = PATTERNS[nextPattern].phases[0].seconds;
    remainingRef.current = nextRemaining;
    phaseIndexRef.current = 0;
    phaseLeftRef.current = firstPhase;
    patternRef.current = PATTERNS[nextPattern];
    setRemaining(nextRemaining);
    setPhaseIndex(0);
    setPhaseLeft(firstPhase);
    setScale(0.9);
  }

  function toggle() {
    if (remaining <= 0) {
      reset(minutes, patternId);
      setRunning(true);
      return;
    }
    setRunning((v) => !v);
  }

  const progress = 1 - remaining / totalSession;

  return (
    <div className={`rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50 to-white p-4 ${className}`}>
      {!compact && (
        <div className="mb-3">
          <p className="text-sm font-semibold text-sky-950">正念呼吸引导</p>
          <p className="mt-1 text-xs leading-5 text-sky-800">跟着圆圈节奏呼吸，可先选时长与模式。</p>
        </div>
      )}
      {compact && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-sky-800">可视化呼吸引导</p>
      )}

      <div className="flex flex-wrap gap-2">
        {DURATIONS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={running}
            onClick={() => reset(m, patternId)}
            className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold ${
              minutes === m ? "bg-sky-700 text-white" : "border border-sky-200 bg-white text-sky-900 hover:bg-sky-50"
            } disabled:opacity-60`}
          >
            {m} 分钟
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(PATTERNS) as BreathPatternId[]).map((id) => (
          <button
            key={id}
            type="button"
            disabled={running}
            onClick={() => reset(minutes, id)}
            className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold ${
              patternId === id ? "bg-violet-700 text-white" : "border border-border bg-white hover:bg-muted"
            } disabled:opacity-60`}
          >
            {PATTERNS[id].label}
          </button>
        ))}
      </div>

      <div className="relative mx-auto mt-5 grid h-44 w-44 place-items-center">
        <div
          className="absolute h-40 w-40 rounded-full bg-sky-200/50"
          style={{ transform: `scale(${scale})`, transition: running ? "none" : "transform 400ms ease" }}
          aria-hidden="true"
        />
        <div
          className="absolute h-28 w-28 rounded-full bg-sky-500/80 shadow-[0_0_40px_rgba(14,165,233,0.35)]"
          style={{ transform: `scale(${scale})`, transition: running ? "none" : "transform 400ms ease" }}
          aria-hidden="true"
        />
        <div className="relative z-10 text-center text-white">
          <p className="text-lg font-bold drop-shadow">{running || remaining < totalSession ? phase.label : "准备"}</p>
          <p className="text-xs opacity-90">{running ? `${Math.ceil(phaseLeft)}s` : pattern.hint}</p>
        </div>
      </div>

      <div className="mt-2 text-center">
        <p className="text-2xl font-bold tabular-nums text-sky-950">{formatClock(Math.ceil(remaining))}</p>
        <div className="mx-auto mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sky-100">
          <div className="h-full rounded-full bg-sky-600 transition-[width]" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800"
        >
          {running ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          {running ? "暂停" : remaining <= 0 ? "再来一次" : "开始"}
        </button>
        <button
          type="button"
          onClick={() => reset(minutes, patternId)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-900 hover:bg-sky-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          重置
        </button>
      </div>
    </div>
  );
}
