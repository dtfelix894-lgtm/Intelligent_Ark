"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// 碎片粒子
interface Shard {
  id: number;
  glyph: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  color: string;
  size: number;
}

const SHARD_COLORS = ["#fbbf24", "#f472b6", "#60a5fa", "#a78bfa", "#34d399", "#fb923c", "#38bdf8"];
const SPARKLES = ["✦", "✧", "✶", "·", "•", "◆"];
const AFFIRMATIONS = [
  "放下了。明天的你，会感谢现在松手的你。",
  "它碎了，你还在 —— 这就够了。",
  "写出来、砸碎它，你已经比刚才轻一点了。",
  "情绪没有对错，谢谢你愿意面对它。",
  "深呼吸。你已经做得很好了。",
  "烦恼会散开，就像此刻的星光一样。",
  "把它交给夜空吧，你不必一个人扛。",
];
const CHARGE_MS = 850;
const RELEASE_THRESHOLD = 0.5;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 用索引确定性地生成星位，避免每次渲染抖动
function starPos(i: number): { left: number; top: number } {
  const a = Math.sin(i * 127.1) * 43758.5453;
  const b = Math.sin(i * 311.7) * 43758.5453;
  return { left: (a - Math.floor(a)) * 96 + 2, top: (b - Math.floor(b)) * 70 + 15 };
}

export function EmotionShredder() {
  const [text, setText] = useState("");
  const [worry, setWorry] = useState<string | null>(null);
  const [charge, setCharge] = useState(0);
  const [shards, setShards] = useState<Shard[]>([]);
  const [affirm, setAffirm] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [released, setReleased] = useState<number>(() => {
    try { return parseInt(localStorage.getItem("shredder_released") || "0", 10) || 0; } catch { return 0; }
  });
  const [releasedToday, setReleasedToday] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("shredder_today");
      if (raw) { const o = JSON.parse(raw); if (o.date === todayKey()) return o.count || 0; }
    } catch {}
    return 0;
  });

  const chargingRef = useRef(false);
  const chargeStartRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const shardIdRef = useRef(0);
  const blockRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 卸载时清掉动画帧
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // WebAudio 合成碎裂音（无素材依赖，触发在用户手势里，不受自动播放限制）
  const playShatter = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioCtxRef.current || (audioCtxRef.current = new Ctx());
      const now = ctx.currentTime;
      // 一段高通噪声 = "哗啦"碎裂
      const len = Math.floor(ctx.sampleRate * 0.25);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.35, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1100;
      noise.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
      noise.start(now);
      // 下行音 = 落下感
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.3);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.18, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(og); og.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.32);
    } catch {}
  }, []);

  const shatter = useCallback(() => {
    if (worry == null) return;
    const rect = blockRef.current?.getBoundingClientRect();
    const cx = (rect ? rect.width : 280) / 2;
    const cy = (rect ? rect.height : 120) / 2;
    // 烦恼文字本身碎成字符，飘向星空
    const glyphs = worry.replace(/\s/g, "").split("").slice(0, 18);
    const total = Math.min(34, Math.max(18, glyphs.length + 14));
    const fresh: Shard[] = [];
    for (let i = 0; i < total; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 220;
      fresh.push({
        id: ++shardIdRef.current,
        glyph: i < glyphs.length ? glyphs[i] : SPARKLES[Math.floor(Math.random() * SPARKLES.length)],
        x: cx + (Math.random() - 0.5) * 60,
        y: cy + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120, // 整体偏上，向星空飘散
        rot: (Math.random() - 0.5) * 720,
        color: SHARD_COLORS[Math.floor(Math.random() * SHARD_COLORS.length)],
        size: 14 + Math.floor(Math.random() * 22),
      });
    }
    setShards((prev) => [...prev, ...fresh]);
    const ids = fresh.map((s) => s.id);
    setTimeout(() => setShards((prev) => prev.filter((s) => !ids.includes(s.id))), 1100);

    // 计数 + 持久化
    setReleased((prev) => {
      const n = prev + 1;
      try { localStorage.setItem("shredder_released", String(n)); } catch {}
      return n;
    });
    setReleasedToday((prev) => {
      const n = prev + 1;
      try { localStorage.setItem("shredder_today", JSON.stringify({ date: todayKey(), count: n })); } catch {}
      return n;
    });

    // 多感官反馈
    setAffirm(AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)]);
    setShake(true);
    setTimeout(() => setShake(false), 320);
    try { (navigator as unknown as { vibrate?: (p: number | number[]) => void }).vibrate?.([0, 40, 30, 60]); } catch {}
    playShatter();

    // 回到输入态
    setWorry(null);
    setText("");
    setCharge(0);
  }, [worry, playShatter]);

  const tick = useCallback(() => {
    if (!chargingRef.current) return;
    const c = Math.min(1, (performance.now() - chargeStartRef.current) / CHARGE_MS);
    setCharge(c);
    if (c >= 1) {
      chargingRef.current = false;
      shatter();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [shatter]);

  const startCharge = useCallback(() => {
    if (worry == null) return;
    chargingRef.current = true;
    chargeStartRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [worry, tick]);

  const endCharge = useCallback(() => {
    if (!chargingRef.current) return;
    chargingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const c = Math.min(1, (performance.now() - chargeStartRef.current) / CHARGE_MS);
    setCharge(0);
    if (c >= RELEASE_THRESHOLD) shatter();
  }, [shatter]);

  const submitWorry = () => {
    const w = text.trim();
    setWorry(w.length ? w : "💢 说不清的烦");
    setAffirm(null);
  };

  return (
    <div className={`flex flex-col items-center gap-5 select-none ${shake ? "ark-shake" : ""}`} style={{ width: "min(92vw, 360px)" }}>
      <style>{`
        @keyframes ark-shatter { 0%{transform:translate(0,0) rotate(0); opacity:1;} 100%{transform:translate(var(--vx),var(--vy)) rotate(var(--rot)); opacity:0;} }
        @keyframes ark-shake { 0%,100%{transform:translate(0,0);} 20%{transform:translate(-6px,3px);} 40%{transform:translate(6px,-3px);} 60%{transform:translate(-4px,-2px);} 80%{transform:translate(4px,2px);} }
        .ark-shake{animation:ark-shake .32s ease-in-out;}
        @keyframes ark-twinkle{0%,100%{opacity:.2;}50%{opacity:.9;}}
      `}</style>

      {/* ── 释怀星空 ── */}
      <div className="w-full">
        <div
          className="relative h-12 w-full overflow-hidden rounded-xl"
          style={{ background: "linear-gradient(180deg, rgba(30,27,75,.6), rgba(15,23,42,.3))", border: "1px solid rgba(148,163,184,.15)" }}
        >
          {Array.from({ length: Math.min(released, 36) }).map((_, i) => {
            const p = starPos(i);
            return (
              <span
                key={i}
                className="absolute"
                style={{
                  left: `${p.left}%`,
                  top: `${p.top}%`,
                  fontSize: 6 + (i % 4) * 2,
                  color: SHARD_COLORS[i % SHARD_COLORS.length],
                  animation: `ark-twinkle ${1.8 + (i % 5) * 0.4}s ease-in-out ${(i % 7) * 0.2}s infinite`,
                }}
              >
                ✦
              </span>
            );
          })}
        </div>
        <p className="text-center text-white/50 text-xs mt-1.5">
          ✦ 你已放下 <span className="font-bold" style={{ color: "#fbbf24" }}>{released}</span> 件烦恼
        </p>
      </div>

      {/* ── 中央：输入 / 烦恼块 / 碎片 ── */}
      <div className="relative w-full flex items-center justify-center" style={{ minHeight: 168 }}>
        {/* 碎片层 */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{ overflow: "visible" }}>
          <div className="relative" style={{ width: 280, height: 120 }}>
            {shards.map((s) => (
              <span
                key={s.id}
                className="absolute font-bold"
                style={{
                  left: s.x,
                  top: s.y,
                  color: s.color,
                  fontSize: s.size,
                  lineHeight: 1,
                  ["--vx" as string]: `${s.vx}px`,
                  ["--vy" as string]: `${s.vy}px`,
                  ["--rot" as string]: `${s.rot}deg`,
                  animation: "ark-shatter 1s ease-out forwards",
                } as React.CSSProperties}
              >
                {s.glyph}
              </span>
            ))}
          </div>
        </div>

        {worry == null ? (
          // 输入态
          <div className="w-full flex flex-col gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitWorry(); } }}
              className="w-full rounded-2xl p-4 text-base text-white placeholder-white/25 resize-none focus:outline-none"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", height: 110 }}
              placeholder="写下此刻压在心里的烦恼…"
              autoFocus
            />
            <button
              onClick={submitWorry}
              className="w-full rounded-xl py-3 text-sm font-semibold transition-all"
              style={{ background: "rgba(244,114,182,.18)", border: "1px solid rgba(244,114,182,.4)", color: "#f9a8d4" }}
            >
              把它揪出来 →
            </button>
          </div>
        ) : (
          // 烦恼块（长按蓄力）
          <div
            ref={blockRef}
            onPointerDown={startCharge}
            onPointerUp={endCharge}
            onPointerLeave={endCharge}
            className="relative cursor-pointer rounded-2xl px-6 py-7 text-center touch-none"
            style={{
              width: 280,
              minHeight: 120,
              background: `linear-gradient(135deg, rgba(244,114,182,${0.15 + charge * 0.25}), rgba(168,85,247,${0.12 + charge * 0.22}))`,
              border: "1px solid rgba(244,114,182,.45)",
              transform: `scale(${1 - charge * 0.06})`,
              boxShadow: `0 0 ${10 + charge * 45}px rgba(244,114,182,${0.3 + charge * 0.5})`,
              transition: chargingRef.current ? "none" : "transform .15s, box-shadow .15s",
            }}
          >
            <span className="text-2xl">💢</span>
            <p className="text-white text-base font-medium mt-2 break-words">{worry}</p>

            {/* 裂纹（随蓄力加深） */}
            {charge > 0.12 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 280 120"
                preserveAspectRatio="none"
                style={{ opacity: charge }}
              >
                <polyline points="140,0 132,38 152,58 138,120" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth={0.6 + charge * 1.6} />
                <polyline points="152,58 96,72 38,56" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={0.6 + charge * 1.2} />
                <polyline points="152,58 206,76 252,60" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={0.6 + charge * 1.2} />
              </svg>
            )}

            {/* 蓄力进度条 */}
            <div className="absolute -bottom-7 left-0 right-0 flex justify-center">
              <div className="h-1.5 w-40 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.12)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${charge * 100}%`, background: charge >= RELEASE_THRESHOLD ? "#f87171" : "#fbbf24", transition: chargingRef.current ? "none" : "width .15s" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 安抚文案 ── */}
      {affirm && worry == null && (
        <p className="text-center text-white/80 text-sm leading-relaxed" style={{ maxWidth: 300 }}>
          {affirm}
        </p>
      )}

      {/* ── 提示 ── */}
      <p className="text-white/40 text-xs text-center">
        {worry == null ? `按住用力砸碎 · 今天已放下 ${releasedToday} 件` : "按住别松手，用力把它砸碎 💥"}
      </p>
    </div>
  );
}
