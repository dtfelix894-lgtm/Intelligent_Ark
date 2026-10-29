"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, SmilePlus } from "lucide-react";

export type MoodLevel = 1 | 2 | 3 | 4 | 5;

type MoodEntry = {
  mood: MoodLevel;
  label: string;
  at: string;
};

type MoodStore = Record<string, MoodEntry>;

const STORAGE_KEY = "ark_mood_checkin_v1";

const MOODS: { level: MoodLevel; emoji: string; label: string }[] = [
  { level: 1, emoji: "😔", label: "很低落" },
  { level: 2, emoji: "😕", label: "有点沉" },
  { level: 3, emoji: "😐", label: "还好" },
  { level: 4, emoji: "🙂", label: "不错" },
  { level: 5, emoji: "😄", label: "很明亮" },
];

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readStore(): MoodStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MoodStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: MoodStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota / private mode */
  }
}

function last7Keys(now = new Date()) {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(todayKey(d));
  }
  return keys;
}

function weekdayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

export function MoodCheckIn() {
  const [store, setStore] = useState<MoodStore>({});
  const [ready, setReady] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const today = todayKey();

  useEffect(() => {
    setStore(readStore());
    setReady(true);
  }, []);

  const series = useMemo(() => {
    const keys = last7Keys();
    return keys.map((key) => ({
      key,
      label: weekdayLabel(key),
      mood: store[key]?.mood ?? null,
      isToday: key === today,
    }));
  }, [store, today]);

  const todayEntry = store[today];

  function save(level: MoodLevel) {
    const item = MOODS.find((m) => m.level === level)!;
    const next: MoodStore = {
      ...store,
      [today]: { mood: level, label: item.label, at: new Date().toISOString() },
    };
    // prune older than 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffKey = todayKey(cutoff);
    for (const key of Object.keys(next)) {
      if (key < cutoffKey) delete next[key];
    }
    setStore(next);
    writeStore(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  }

  if (!ready) {
    return (
      <section className="rounded-2xl border border-border/90 bg-white/95 p-4" aria-label="情绪打卡加载中">
        <div className="h-24 animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
      </section>
    );
  }

  return (
    <section className="relative rounded-2xl border border-border/90 bg-white/95 p-4 shadow-[0_6px_20px_rgba(15,23,42,0.03)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SmilePlus className="h-4 w-4 text-rose-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold">今日心情打卡</h3>
        </div>
        {savedFlash ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            已记下
          </span>
        ) : todayEntry ? (
          <span className="text-[11px] text-muted-foreground">今日：{todayEntry.label}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">一键记录</span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {MOODS.map(({ level, emoji, label }) => {
          const active = todayEntry?.mood === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => save(level)}
              aria-pressed={active}
              title={label}
              className={`ark-interactive flex min-h-[3.25rem] flex-col items-center justify-center rounded-xl border px-1 text-center transition-colors active:scale-[0.98] ${
                active
                  ? "border-rose-300 bg-rose-50 text-rose-950"
                  : "border-border/80 bg-secondary/30 hover:bg-secondary/70"
              }`}
            >
              <span className="text-base leading-none" aria-hidden="true">
                {emoji}
              </span>
              <span className="mt-1 text-[10px] font-semibold leading-tight">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">近 7 日趋势</p>
        <div className="flex h-20 items-end gap-1.5" role="img" aria-label="近七日前心情柱状图">
          {series.map(({ key, label, mood, isToday }) => {
            const height = mood == null ? 12 : 18 + mood * 12;
            return (
              <div key={key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full max-w-[28px] rounded-md ${
                    mood == null ? "bg-muted" : isToday ? "bg-rose-500" : "bg-rose-300/90"
                  }`}
                  style={{ height }}
                  title={mood == null ? "未打卡" : MOODS[mood - 1].label}
                />
                <span className={`text-[10px] ${isToday ? "font-bold text-rose-800" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          仅保存在本机浏览器（localStorage），不上传；用于自我觉察，不作诊断。
        </p>
      </div>
    </section>
  );
}
