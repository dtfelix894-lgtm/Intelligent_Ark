"use client";

import { useEffect, useState } from "react";
import { BookMarked, Loader2, Plus, Trash2 } from "lucide-react";
import { useLazyPage } from "./useLazyPage";

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
const PAGE_SIZE = 4;
const TEXT_MAX = 500;

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

function fieldClass(invalid: boolean, multiline = false) {
  const base = invalid
    ? "mt-1 w-full rounded-xl border border-red-300 bg-red-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
    : "mt-1 w-full rounded-xl border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return multiline ? `${base} p-3 text-sm min-h-[64px]` : `${base} h-11 px-3 text-sm`;
}

export function CbtThoughtRecord() {
  const [items, setItems] = useState<ThoughtRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState<"list" | "compose">("list");
  const [touched, setTouched] = useState({ situation: false, thought: false });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { slice, hasMore, loadMore, shown, total } = useLazyPage(items, PAGE_SIZE);

  useEffect(() => {
    setItems(readAll());
    setReady(true);
  }, []);

  const situationTrim = form.situation.trim();
  const thoughtTrim = form.thought.trim();
  const situationError =
    touched.situation && situationTrim.length < 2
      ? "请用至少 2 个字描述情境"
      : touched.situation && situationTrim.length > TEXT_MAX
        ? `最多 ${TEXT_MAX} 字`
        : "";
  const thoughtError =
    touched.thought && thoughtTrim.length < 2
      ? "请写下自动想法（至少 2 个字）"
      : touched.thought && thoughtTrim.length > TEXT_MAX
        ? `最多 ${TEXT_MAX} 字`
        : "";
  const canSave =
    !situationError &&
    !thoughtError &&
    situationTrim.length >= 2 &&
    thoughtTrim.length >= 2 &&
    situationTrim.length <= TEXT_MAX &&
    thoughtTrim.length <= TEXT_MAX;

  function toggleDistortion(label: string) {
    setForm((prev) => ({
      ...prev,
      distortions: prev.distortions.includes(label)
        ? prev.distortions.filter((d) => d !== label)
        : [...prev.distortions, label],
    }));
  }

  async function save() {
    setTouched({ situation: true, thought: true });
    if (!canSave) return;
    setSaveState("saving");
    await new Promise((r) => window.setTimeout(r, 280));
    const entry: ThoughtRecord = {
      id: `${Date.now()}`,
      situation: situationTrim,
      thought: thoughtTrim,
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
    setTouched({ situation: false, thought: false });
    setMode("list");
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1600);
  }

  async function remove(id: string) {
    setDeletingId(id);
    await new Promise((r) => window.setTimeout(r, 200));
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    writeAll(next);
    setDeletingId(null);
  }

  if (!ready) {
    return <div className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none" aria-label="想法记录加载中" />;
  }

  if (mode === "compose") {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold">写一轮想法记录</p>
        <label className="block text-xs font-semibold">
          情境
          <textarea
            value={form.situation}
            aria-invalid={Boolean(situationError)}
            onBlur={() => setTouched((t) => ({ ...t, situation: true }))}
            onChange={(e) => setForm({ ...form, situation: e.target.value.slice(0, TEXT_MAX + 10) })}
            className={fieldClass(Boolean(situationError), true)}
            placeholder="当时发生了什么？"
          />
          {situationError ? (
            <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
              {situationError}
            </span>
          ) : null}
        </label>
        <label className="block text-xs font-semibold">
          自动想法
          <textarea
            value={form.thought}
            aria-invalid={Boolean(thoughtError)}
            onBlur={() => setTouched((t) => ({ ...t, thought: true }))}
            onChange={(e) => setForm({ ...form, thought: e.target.value.slice(0, TEXT_MAX + 10) })}
            className={fieldClass(Boolean(thoughtError), true)}
            placeholder="脑子里闪过的话是？"
          />
          {thoughtError ? (
            <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
              {thoughtError}
            </span>
          ) : null}
        </label>
        <label className="block text-xs font-semibold">
          情绪（词语）
          <input
            value={form.emotion}
            onChange={(e) => setForm({ ...form, emotion: e.target.value.slice(0, 40) })}
            className={fieldClass(false)}
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
            onChange={(e) => setForm({ ...form, reframe: e.target.value.slice(0, TEXT_MAX) })}
            className={fieldClass(false, true)}
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
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saveState === "saving"}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {saveState === "saving" ? "保存中…" : "保存这一轮"}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setTouched({ situation: false, thought: false });
              setMode("list");
            }}
            disabled={saveState === "saving"}
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            取消
          </button>
          {saveState === "saved" ? (
            <span className="text-xs font-semibold text-emerald-700" role="status">
              已保存
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-violet-700" aria-hidden="true" />
          <h3 className="text-sm font-semibold">想法记录</h3>
        </div>
        {saveState === "saved" ? (
          <span className="text-[11px] font-semibold text-emerald-700" role="status">
            已保存
          </span>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        情境 → 想法 → 情绪 → 偏差 → 换个想法。
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
        <>
          <p className="text-[11px] text-muted-foreground">
            已显示 {shown}/{total} 条
          </p>
          <ul className="space-y-2">
            {slice.map((item) => (
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
                    onClick={() => void remove(item.id)}
                    disabled={deletingId === item.id}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    aria-label="删除这条记录"
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {hasMore ? (
            <button
              type="button"
              onClick={loadMore}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border bg-white text-sm font-semibold hover:bg-muted"
            >
              加载更多
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
