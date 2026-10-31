"use client";

import { useEffect, useMemo, useState } from "react";
import { BookHeart, Loader2, Plus, Trash2 } from "lucide-react";
import { useLazyPage } from "./useLazyPage";

export type DiaryEntry = {
  id: string;
  date: string;
  mood?: 1 | 2 | 3 | 4 | 5;
  body: string;
  at: string;
};

const STORAGE_KEY = "ark_emotion_diary_v1";
const DIARY_API = "/api/student/diary";
const BODY_MIN = 2;
const BODY_MAX = 800;
const PAGE_SIZE = 4;

const MOOD_LABELS: Record<number, string> = {
  1: "很低落",
  2: "有点沉",
  3: "还好",
  4: "不错",
  5: "很明亮",
};

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readLocal(): DiaryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DiaryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(items: DiaryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 80)));
  } catch {
    /* ignore */
  }
}

async function tryLoadRemote(): Promise<DiaryEntry[] | null> {
  try {
    const res = await fetch(DIARY_API, { credentials: "include" });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: DiaryEntry[] };
    return Array.isArray(data.items) ? data.items : null;
  } catch {
    return null;
  }
}

function fieldClass(invalid: boolean) {
  return invalid
    ? "mt-1 w-full rounded-xl border border-red-300 bg-red-50/40 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
    : "mt-1 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
}

export function EmotionDiary() {
  const [items, setItems] = useState<DiaryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"list" | "compose">("list");
  const [date, setDate] = useState(todayKey());
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | undefined>(undefined);
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState({ date: false, body: false });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await tryLoadRemote();
      if (cancelled) return;
      if (remote) {
        setItems(remote);
      } else {
        setItems(readLocal());
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.at.localeCompare(a.at))),
    [items],
  );
  const { slice, hasMore, loadMore, shown, total } = useLazyPage(sorted, PAGE_SIZE);

  const bodyTrim = body.trim();
  const dateError =
    touched.date && date > todayKey() ? "日期不能晚于今天" : touched.date && !date ? "请选择日期" : "";
  const bodyError =
    touched.body && bodyTrim.length < BODY_MIN
      ? `至少写 ${BODY_MIN} 个字`
      : touched.body && bodyTrim.length > BODY_MAX
        ? `最多 ${BODY_MAX} 字`
        : "";
  const canSave = !dateError && !bodyError && bodyTrim.length >= BODY_MIN && bodyTrim.length <= BODY_MAX && !dateError;

  function persist(next: DiaryEntry[]) {
    setItems(next);
    writeLocal(next);
  }

  async function save() {
    setTouched({ date: true, body: true });
    if (!canSave) return;
    setSaveState("saving");
    await new Promise((r) => window.setTimeout(r, 280));
    const entry: DiaryEntry = {
      id: `${Date.now()}`,
      date: date || todayKey(),
      mood,
      body: bodyTrim,
      at: new Date().toISOString(),
    };
    persist([entry, ...items]);
    setBody("");
    setMood(undefined);
    setDate(todayKey());
    setTouched({ date: false, body: false });
    setMode("list");
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1800);
  }

  async function remove(id: string) {
    setDeletingId(id);
    await new Promise((r) => window.setTimeout(r, 200));
    persist(items.filter((item) => item.id !== id));
    setDeletingId(null);
  }

  if (!ready) {
    return <div className="h-28 animate-pulse rounded-2xl border border-border bg-muted/50 motion-reduce:animate-none" aria-label="日记加载中" />;
  }

  if (mode === "compose") {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold">写一条情绪日记</p>
        <label className="block text-xs font-semibold">
          日期
          <input
            type="date"
            value={date}
            max={todayKey()}
            aria-invalid={Boolean(dateError)}
            onBlur={() => setTouched((t) => ({ ...t, date: true }))}
            onChange={(e) => setDate(e.target.value)}
            className={`${fieldClass(Boolean(dateError))} h-11`}
          />
          {dateError ? (
            <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
              {dateError}
            </span>
          ) : null}
        </label>
        <div>
          <p className="text-xs font-semibold">心情（可选）</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([1, 2, 3, 4, 5] as const).map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={mood === level}
                onClick={() => setMood((cur) => (cur === level ? undefined : level))}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  mood === level ? "bg-rose-600 text-white" : "border border-border bg-secondary/40"
                }`}
              >
                {MOOD_LABELS[level]}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-xs font-semibold">
          正文
          <textarea
            value={body}
            aria-invalid={Boolean(bodyError)}
            onBlur={() => setTouched((t) => ({ ...t, body: true }))}
            onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX + 20))}
            className={`${fieldClass(Boolean(bodyError))} min-h-[120px] p-3`}
            placeholder="今天想留给自己的话…"
          />
          <span className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {bodyError ? (
                <span role="alert" className="font-medium text-red-700">
                  {bodyError}
                </span>
              ) : (
                "写真实感受即可，不必追求完美"
              )}
            </span>
            <span className={bodyTrim.length > BODY_MAX ? "text-red-700" : ""}>
              {bodyTrim.length}/{BODY_MAX}
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saveState === "saving"}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
          >
            {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {saveState === "saving" ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("list");
              setTouched({ date: false, body: false });
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
          <BookHeart className="h-4 w-4 text-rose-700" aria-hidden="true" />
          <h3 className="text-sm font-semibold">情绪日记</h3>
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">自由写下此刻的感受。</p>
      <button
        type="button"
        onClick={() => setMode("compose")}
        className="ark-interactive inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-3 text-sm font-semibold text-white hover:bg-rose-800"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        写日记
      </button>
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          还没有日记。想留一笔时再写就好。
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
                    <p className="text-xs font-semibold text-muted-foreground">
                      {item.date}
                      {item.mood ? ` · ${MOOD_LABELS[item.mood]}` : ""}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{item.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(item.id)}
                    disabled={deletingId === item.id}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    aria-label="删除这篇日记"
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
