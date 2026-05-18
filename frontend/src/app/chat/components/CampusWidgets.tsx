"use client";

import { useState } from "react";

/* ─── 周情绪基线波动图骨架屏 ─── */
export function EmotionBaselineChart() {
  const bars = [
    { height: 40, label: "一" },
    { height: 65, label: "二" },
    { height: 50, label: "三" },
    { height: 80, label: "四" },
    { height: 60, label: "五" },
    { height: 45, label: "六" },
    { height: 70, label: "日" },
  ];

  return (
    <div className="rounded-xl p-4 border" style={{ background: "var(--card-bg)", borderColor: "var(--panel-border)" }}>
      <p className="text-xs font-medium mb-3" style={{ color: "var(--accent-cyan)" }}>
        📊 周情绪基线
      </p>

      {/* 骨架柱状图 */}
      <div className="flex items-end gap-1 h-20">
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-sm skeleton-bar"
              style={{
                height: `${bar.height}%`,
                background: "rgba(6, 182, 212, 0.25)",
                animationDelay: `${i * 0.15}s`,
              }}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {bar.label}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
        本周整体情绪平稳 ↑
      </p>
    </div>
  );
}

/* ─── 白噪音 / 冥想快捷工具卡片 ─── */
const SOUNDS = [
  { icon: "🌧️", label: "雨声" },
  { icon: "🌊", label: "海浪" },
  { icon: "🍃", label: "森林" },
  { icon: "💭", label: "冥想" },
] as const;

export function WhiteNoiseCard() {
  const [playing, setPlaying] = useState<string | null>(null);

  const handlePlay = (label: string) => {
    setPlaying((prev) => (prev === label ? null : label));
  };

  return (
    <div className="rounded-xl p-4 border" style={{ background: "var(--card-bg)", borderColor: "var(--panel-border)" }}>
      <p className="text-xs font-medium mb-3" style={{ color: "var(--accent-purple)" }}>
        🧘 放松一下
      </p>

      <div className="grid grid-cols-2 gap-2">
        {SOUNDS.map((s) => (
          <button
            key={s.label}
            onClick={() => handlePlay(s.label)}
            className="text-xs rounded-lg py-2 px-2 text-left transition-all"
            style={{
              background: playing === s.label ? "rgba(168, 85, 247, 0.35)" : "rgba(168, 85, 247, 0.15)",
              color: playing === s.label ? "#e9d5ff" : "rgba(168, 85, 247, 0.8)",
              border: "1px solid rgba(168, 85, 247, 0.2)",
            }}
          >
            <span className="mr-1">{s.icon}</span>
            {s.label}
            {playing === s.label && (
              <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
