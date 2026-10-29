"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { CircleDot, Keyboard, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmotionShredder } from "../components/EmotionShredder";

type Game = "shredder" | "wooden-fish" | "typing";
type Particle = { id: number; char: string; x: number; y: number; vx: number; vy: number; color: string };

const WOODEN_FISH_KEY = "ark_wooden_fish_daily";

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readDailyCount(): number {
  try {
    const raw = localStorage.getItem(WOODEN_FISH_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date?: string; count?: number };
    if (parsed?.date === todayKey() && Number.isFinite(parsed.count) && (parsed.count as number) >= 0) {
      return parsed.count as number;
    }
    return 0;
  } catch {
    return 0;
  }
}

function writeDailyCount(count: number) {
  try {
    localStorage.setItem(WOODEN_FISH_KEY, JSON.stringify({ date: todayKey(), count }));
  } catch {
    /* The tool remains usable without persistence. */
  }
}

function WoodenFish() {
  const [count, setCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    setCount(readDailyCount());
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void audio.current?.close();
    };
  }, []);

  function strike() {
    const next = count + 1;
    setCount(next);
    setCombo((value) => value + 1);
    writeDailyCount(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCombo(0), 1600);
    try {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = audio.current || (audio.current = new AudioCtor());
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(240, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(120, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    } catch {
      /* Audio is optional. */
    }
  }

  return (
    <div className="flex flex-col items-center py-4 text-center">
      <p className="text-sm text-muted-foreground">每次点击，给忙乱的思绪一个短暂停顿。</p>
      <button
        type="button"
        onClick={strike}
        className="mt-8 grid h-44 w-44 place-items-center rounded-full border-[10px] border-amber-200 bg-gradient-to-br from-amber-500 to-amber-800 text-white shadow-[0_18px_45px_rgba(146,64,14,.25)] transition-colors hover:from-amber-600 hover:to-amber-900 active:bg-amber-900"
        aria-label="敲电子木鱼"
      >
        <CircleDot className="h-20 w-20" aria-hidden="true" />
      </button>
      <p className="mt-7 text-3xl font-bold text-amber-900">{count}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        今日静心次数{combo > 1 ? ` · 连续 ${combo} 次` : ""}
      </p>
    </div>
  );
}

function TypingWall() {
  const [text, setText] = useState("");
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef = useRef(0);
  const colors = ["#6d28d9", "#047857", "#b45309", "#be123c", "#0369a1"];

  function onType(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
  }

  function release() {
    const chars = Array.from(text.trim()).filter((char) => char.trim().length > 0).slice(0, 48);
    if (!chars.length) return;
    const fresh = chars.map((char) => ({
      id: ++idRef.current,
      char,
      x: 20 + Math.random() * 60,
      y: 35 + Math.random() * 30,
      vx: (Math.random() - 0.5) * 260,
      vy: -80 - Math.random() * 180,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    setParticles((current) => [...current.slice(-12), ...fresh]);
    setText("");
    setTimeout(() => {
      const ids = new Set(fresh.map((item) => item.id));
      setParticles((current) => current.filter((item) => !ids.has(item.id)));
    }, 1200);
  }

  return (
    <div>
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-emerald-50 p-4 text-sm leading-6 text-muted-foreground">
        内容只在当前页面呈现，不会发送或保存。写完后点「释放」，看着文字慢慢散开。
      </div>
      <div className="relative mt-5 h-72 overflow-hidden rounded-2xl border border-border bg-white">
        <div className="pointer-events-none absolute inset-0">
          {particles.map((item) => (
            <span
              key={item.id}
              className="ark-fly-away absolute font-semibold"
              style={
                {
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  color: item.color,
                  ["--fly-x" as string]: `${item.vx}px`,
                  ["--fly-y" as string]: `${item.vy}px`,
                } as React.CSSProperties
              }
            >
              {item.char}
            </span>
          ))}
        </div>
        <label htmlFor="typing-wall" className="sr-only">
          在打字发泄墙输入文字
        </label>
        <textarea
          id="typing-wall"
          value={text}
          onChange={onType}
          autoFocus
          className="absolute inset-x-4 bottom-16 h-24 resize-none rounded-xl border border-input bg-background/90 p-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="先写下来，写完再点释放…"
        />
        <button
          type="button"
          onClick={release}
          disabled={!text.trim()}
          className="absolute inset-x-4 bottom-4 inline-flex h-11 items-center justify-center rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          释放
        </button>
      </div>
    </div>
  );
}

export function ReleaseTools({ prefer = null }: { prefer?: Game | null }) {
  const [active, setActive] = useState<Game | null>(null);

  useEffect(() => {
    if (prefer) setActive(prefer);
  }, [prefer]);
  const items = [
    { id: "shredder" as const, title: "情绪碎纸机", text: "写下烦恼，再亲手放下", icon: Sparkles },
    { id: "wooden-fish" as const, title: "电子木鱼", text: "用轻敲找回片刻专注", icon: CircleDot },
    { id: "typing" as const, title: "打字发泄墙", text: "文字只在本页飘散", icon: Keyboard },
  ];
  const title = items.find((item) => item.id === active)?.title || "情绪释放工具";

  return (
    <>
      <div className="space-y-2">
        {items.map(({ id, title: itemTitle, text, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className="ark-interactive flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-white px-3 text-left hover:bg-secondary/60"
          >
            <span className="ark-icon-tile h-10 w-10">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{itemTitle}</span>
              <span className="block text-xs leading-5 text-muted-foreground">{text}</span>
            </span>
          </button>
        ))}
      </div>
      <Dialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        <DialogContent
          className={`max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl ${
            active === "shredder" ? "max-w-xl border-slate-700 bg-slate-950 text-white" : "max-w-xl bg-white"
          }`}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={active === "shredder" ? "text-slate-300" : undefined}>
              {active === "shredder"
                ? "写下来、看见它，然后把它交给星空。"
                : active === "wooden-fish"
                  ? "用一个简单动作，让注意力回到当下。"
                  : "输入内容只在当前页面短暂呈现。"}
            </DialogDescription>
          </DialogHeader>
          {active === "shredder" && <EmotionShredder />}
          {active === "wooden-fish" && <WoodenFish />}
          {active === "typing" && <TypingWall />}
        </DialogContent>
      </Dialog>
    </>
  );
}
