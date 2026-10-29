"use client";

import { useEffect, useState } from "react";
import { BookMarked, Plus, Trash2 } from "lucide-react";

type ThoughtRecord = {
  id: string;
  situation: string;
  thought: string;
  emotion: string;
  intensity: number;
  distortions: string[];
  reframe: string;
  intensityAfter: number;
  at: string;
};

const STORAGE_KEY = "ark_cbt_thoughts_v1";

const DISTORTIONS = [
  "非黑即白",
  "灾难化",
  "读心术",
  "以偏概全",
  "情绪推理",
  "应该化",
  "贴标签",
  "个人化",
];

function readAll(): ThoughtRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ThoughtRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: ThoughtRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

const emptyForm = {
  situation: "",
  thought: "",
  emotion: "",
  intensity: 5,
  distortions: [] as string[],
  reframe: "",
  intensityAfter: 5,
};

export function CbtThoughtRecord() {
  const [items, setItems] = useState<ThoughtRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState<"list" | "compose">("list");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setItems(readAll());
    setReady(true);
  }, []);

  function toggleDistortion(label: string) {
    setForm((prev) => ({
      ...prev,
      distortions: prev.distortions.includes(label)
        ? prev.distortions.filter((d) => d !== label)
        : [...prev.distortions, label],
    }));
  }

  function save() {
    if (!form.situation.trim() || !form.thought.trim()) return;
    const entry: ThoughtRecord = {
      id: `${Date.now()}`,
      situation: form.situation.trim(),
      thought: form.thought.trim(),
      emotion: form.emotion.trim() || "未命名情绪",
      intensity: form.intensity,
      distortions: form.distortions,
      reframe: form.reframe.trim(),
      intensityAfter: form.intensityAfter,
      at: new Date().toISOString(),
    };
    const next = [entry, ...items];
    setItems(next);
    writeAll(next);
    setForm(emptyForm);
    setMode("list");
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  }

  function remove(id: string) {
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    writeAll(next);
  }

  if (!ready) {
    return <div className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none" />;
  }

  if (mode === "compose") {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold">写一轮想法记录</p>
        <p className="text-xs leading-5 text-muted-foreground">
          仅保存在本机，只有你能看见。这不是治疗方案，也不构成诊断。
        </p>
        <label className="block text-xs font-semibold">
          情境
          <textarea
            value={form.situation}
            onChange={(e) => setForm({ ...form, situation: e.target.value })}
            className="mt-1 min-h-[64px] w-full rounded-xl border border-input bg-background p-3 text-sm"
            placeholder="当时发生了什么？"
          />
        </label>
        <label className="block text-xs font-semibold">
          自动想法
          <textarea
            value={form.thought}
            onChange={(e) => setForm({ ...form, thought: e.target.value })}
            className="mt-1 min-h-[64px] w-full rounded-xl border border-input bg-background p-3 text-sm"
            placeholder="脑子里闪过的话是？"
          />
        </label>
        <label className="block text-xs font-semibold">
          情绪（词语）
          <input
            value={form.emotion}
            onChange={(e) => setForm({ ...form, emotion: e.target.value })}
            className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            placeholder="如：焦虑、难过、生气"
          />
        </label>
        <label className="block text-xs font-semibold">
          情绪强度 {form.intensity}/10
          <input
            type="range"
            min={0}
            max={10}
            value={form.intensity}
            onChange={(e) => setForm({ ...form, intensity: Number(e.target.value) })}
            className="mt-2 w-full accent-violet-700"
          />
        </label>
        <div>
          <p className="text-xs font-semibold">常见认知偏差（可多选）</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DISTORTIONS.map((label) => {
              const on = form.distortions.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDistortion(label)}
                  aria-pressed={on}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    on ? "bg-violet-700 text-white" : "border border-border bg-secondary/40"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block text-xs font-semibold">
          换个想法 / 替代想法
          <textarea
            value={form.reframe}
            onChange={(e) => setForm({ ...form, reframe: e.target.value })}
            className="mt-1 min-h-[64px] w-full rounded-xl border border-input bg-background p-3 text-sm"
            placeholder="还有没有更平衡、更具体的说法？"
          />
        </label>
        <label className="block text-xs font-semibold">
          再评分 {form.intensityAfter}/10
          <input
            type="range"
            min={0}
            max={10}
            value={form.intensityAfter}
            onChange={(e) => setForm({ ...form, intensityAfter: Number(e.target.value) })}
            className="mt-2 w-full accent-emerald-700"
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={save}
            disabled={!form.situation.trim() || !form.thought.trim()}
            className="inline-flex min-h-11 items-center rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            保存这一轮
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setMode("list");
            }}
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-violet-700" aria-hidden="true" />
          <h3 className="text-sm font-semibold">CBT 想法记录</h3>
        </div>
        {savedFlash ? <span className="text-[11px] font-semibold text-emerald-700">已保存</span> : null}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        情境 → 想法 → 情绪 → 偏差 → 换个想法。仅本机可见，不作诊断或治疗。
      </p>
      <button
        type="button"
        onClick={() => setMode("compose")}
        className="ark-interactive inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-3 text-sm font-semibold text-white hover:bg-violet-800"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        新写一轮
      </button>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          还没有记录。想来一轮轻量梳理时再写。
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.at).toLocaleString("zh-CN", { hour12: false })}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{item.situation}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">想法：{item.thought}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    情绪：{item.emotion} · {item.intensity}→{item.intensityAfter}
                  </p>
                  {item.distortions.length > 0 ? (
                    <p className="mt-1 text-[11px] text-violet-800">偏差：{item.distortions.join("、")}</p>
                  ) : null}
                  {item.reframe ? (
                    <p className="mt-1 text-xs leading-5 text-emerald-900">换个想法：{item.reframe}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700"
                  aria-label="删除这条记录"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
