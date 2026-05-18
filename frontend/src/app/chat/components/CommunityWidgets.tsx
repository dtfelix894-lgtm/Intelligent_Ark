"use client";

import { useState } from "react";

/* ─── 今日服药打卡大按钮 ─── */
export function MedicationCheckIn() {
  const [checked, setChecked] = useState(false);

  return (
    <button
      onClick={() => setChecked((v) => !v)}
      className="w-full rounded-2xl py-5 px-4 font-bold shadow-lg hover:shadow-xl transition-all active:scale-95 text-white flex items-center justify-center gap-2"
      style={{
        background: checked
          ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
          : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
      }}
    >
      <span className="text-xl">{checked ? "✅" : "💊"}</span>
      <span className="text-xl">{checked ? "已打卡" : "今日服药打卡"}</span>
    </button>
  );
}

/* ─── 天气预警 / 社区通知卡片 ─── */
export function CommunityNotify() {
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--panel-border)",
      }}
    >
      <p className="font-medium mb-2 flex items-center gap-2" style={{ color: "var(--accent-orange)" }}>
        <span className="text-lg">🔔</span>
        <span className="text-lg">社区通知</span>
      </p>
      <p className="text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        明日气温骤降 8~10°C，请注意添衣保暖，慢性病患者请留意身体状况。
      </p>
    </div>
  );
}

/* ─── 一键 SOS 急救按钮 ─── */
export function SOSButton() {
  return (
    <button
      className="w-full rounded-2xl py-6 px-4 font-bold text-white flex items-center justify-center gap-2 sos-pulse border-4"
      style={{
        background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
        borderColor: "#fca5a5",
        fontSize: "1.25rem",
      }}
    >
      🚨 一键SOS急救
    </button>
  );
}

/* ─── 按住说话语音输入面板 ─── */
export function VoiceInputPanel() {
  const [pressing, setPressing] = useState(false);
  const [startTimer, setStartTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleStart = () => {
    const t = setTimeout(() => setPressing(true), 200);
    setStartTimer(t);
  };

  const handleEnd = () => {
    if (startTimer) {
      clearTimeout(startTimer);
      setStartTimer(null);
    }
    setPressing(false);
  };

  return (
    <div
      className="rounded-2xl p-6 border"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--panel-border)",
      }}
    >
      <p className="text-base font-medium mb-4 text-center" style={{ color: "var(--text-secondary)" }}>
        🎤 按住说话
      </p>

      <div className="flex justify-center">
        <button
          onMouseDown={handleStart}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchEnd={handleEnd}
          className="w-24 h-24 rounded-full text-white flex items-center justify-center text-4xl shadow-lg transition-all select-none"
          style={{
            background: pressing
              ? "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)"
              : "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
            transform: pressing ? "scale(0.92)" : "scale(1)",
            boxShadow: pressing ? "0 4px 20px rgba(234, 88, 12, 0.5)" : "0 6px 24px rgba(249, 115, 22, 0.35)",
          }}
        >
          🎙️
        </button>
      </div>

      <p
        className="text-sm text-center mt-3"
        style={{ color: pressing ? "var(--accent-orange)" : "var(--text-muted)" }}
      >
        {pressing ? "🔴 正在录音..." : "长按开始说话，松开结束"}
      </p>
    </div>
  );
}
