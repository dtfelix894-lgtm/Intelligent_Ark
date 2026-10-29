"use client";

import { useEffect, useMemo, useState } from "react";
import { BookHeart, Plus, Trash2 } from "lucide-react";

export type DiaryEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  mood?: 1 | 2 | 3 | 4 | 5;
  body: string;
  at: string;
};

const STORAGE_KEY = "ark_emotion_diary_v1";

/** 预留后端对接：未来优先 GET/POST /api/student/diary，失败再回落本机。 */
const DIARY_API = "/api/student/diary";

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
  // 后端尚未提供日记接口时保持 null，前端用 localStorage。
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

export function EmotionDiary() {
  const [items, setItems] = useState<DiaryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [storageNote, setStorageNote] = useState("本机保存");
  const [mode, setMode] = useState<"list" | "compose">("list");
  const [date, setDate] = useState(todayKey());
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | undefined>(undefined);
  const [body, setBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await tryLoadRemote();
      if (cancelled) return;
      if (remote) {
        setItems(remote);
        setStorageNote("已同步服务端");
      } else {
        setItems(readLocal());
        setStorageNote("本机保存（后端日记接口未启用）");
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

  function persist(next: DiaryEntry[]) {
    setItems(next);
    writeLocal(next);
  }

  function save() {
    const text = body.trim();
    if (!text) return;
    const entry: DiaryEntry = {
      id: `${Date.now()}`,
      date: date || todayKey(),
      mood,
      body: text,
      at: new Date().toISOString(),
    };
    persist([entry, ...items]);
    setBody("");
    setMood(undefined);
    setDate(todayKey());
    setMode("list");
  }

  function remove(id: string) {
    persist(items.filter((item) => item.id !== id));
  }

  if (!ready) {
    return <div className="h-28 animate-pulse rounded-2xl border border-border bg-muted/50 motion-reduce:animate-none" />;
  }

  if (mode === "compose") {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold">写一条情绪日记</p>
        <p className="text-xs leading-5 text-muted-foreground">
          仅本人可见，保存在本机。这不是诊断或治疗。· {storageNote}
        </p>
        <label className="block text-xs font-semibold">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          />
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
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 min-h-[120px] w-full rounded-xl border border-input bg-background p-3 text-sm"
            placeholder="今天想留给自己的话…"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!body.trim()}
            className="inline-flex min-h-11 items-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => setMode("list")}
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
          <BookHeart className="h-4 w-4 text-rose-700" aria-hidden="true" />
          <h3 className="text-sm font-semibold">情绪日记</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">{storageNote}</span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">自由写下此刻的感受，仅本人可见，保存在本机。</p>
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
        <ul className="space-y-2">
          {sorted.map((item) => (
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
                  onClick={() => remove(item.id)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700"
                  aria-label="删除这篇日记"
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
