"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useScenario } from "@/lib/scenario-context";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

type RadioTrack = "jingju" | "pingshu" | "health";

const RADIO_ITEMS: { track: RadioTrack; icon: string; playText: string; playingText: string }[] = [
  { track: "jingju", icon: "🎵", playText: "播放经典京剧", playingText: "正在播放..." },
  { track: "pingshu", icon: "🎧", playText: "听单田芳评书", playingText: "正在播放..." },
  { track: "health", icon: "📻", playText: "今日健康广播", playingText: "正在播放..." },
];

// ═══════════════════════════════════════════════════════════════════════
// 【模块一】💊 每日治愈胶囊
// ═══════════════════════════════════════════════════════════════════════
function DailyHealingCapsule() {
  return (
    <Card className="rounded-2xl overflow-hidden" style={{ borderColor: "var(--panel-border)" }}>
      <CardHeader className="pb-2" style={{ background: "var(--card-bg)" }}>
        <CardTitle className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--accent-cyan)" }}>
          <span className="text-lg">💊</span>
          每日治愈
        </CardTitle>
      </CardHeader>
      <CardContent style={{ background: "var(--card-bg)" }}>
        <div
          className="rounded-lg p-4"
          style={{ background: "rgba(30,41,59,0.5)", border: "1px solid rgba(6,182,212,0.15)" }}
        >
          <p className="text-sm leading-relaxed font-light" style={{ color: "#94a3b8" }}>
            <span className="text-2xl align-middle mr-1 text-cyan-400/60 select-none">"</span>
            允许一切发生。你不需要总是那么无懈可击，
            此时此刻的你，已经足够优秀了。深呼吸，世界依然爱你。
            <span className="text-2xl align-middle ml-1 text-cyan-400/60 select-none">"</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 【模块二】赛博解压游乐区（受控组件）
// ═══════════════════════════════════════════════════════════════════════
function CyberRelaxZone({
  onOpenGame,
}: {
  onOpenGame: (type: "muyu" | "typing") => void;
}) {
  return (
    <Card className="rounded-2xl overflow-hidden" style={{ borderColor: "var(--panel-border)" }}>
      <CardHeader className="pb-2" style={{ background: "var(--card-bg)" }}>
        <CardTitle className="text-base font-bold flex items-center gap-2" style={{ color: "var(--accent-emerald)" }}>
          <span className="text-lg">🎮</span>
          赛博解压游乐区
        </CardTitle>
      </CardHeader>
      <CardContent style={{ background: "var(--card-bg)" }}>
        <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>
          大脑过载？来这里清空一下缓存吧 ✨
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onOpenGame("muyu")}
            className="rounded-xl py-3 text-sm font-medium flex flex-col items-center gap-1 transition-all"
            style={{
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.25)",
              color: "#6ee7b7",
            }}
          >
            <span className="text-xl">🪵</span>
            <span>敲电子木鱼</span>
          </button>
          <button
            onClick={() => onOpenGame("typing")}
            className="rounded-xl py-3 text-sm font-medium flex flex-col items-center gap-1 transition-all"
            style={{
              background: "rgba(168,85,247,0.12)",
              border: "1px solid rgba(168,85,247,0.25)",
              color: "#c4b5fd",
            }}
          >
            <span className="text-xl">⌨️</span>
            <span>打字发泄墙</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 【模块三】校园紧急支援
// ═══════════════════════════════════════════════════════════════════════
function CampusSupportCard() {
  return (
    <div
      className="rounded-2xl p-4 border overflow-hidden"
      style={{
        background: "rgba(251,146,60,0.08)",
        borderColor: "rgba(249,115,22,0.25)",
      }}
    >
      <p className="text-[10px] leading-relaxed mb-3" style={{ color: "rgba(251,146,60,0.6)" }}>
        如果觉得撑不住了，随时呼叫现实支援 🛟
      </p>
      <a href="tel:400-161-9995" className="block no-underline">
        <button
          className="w-full rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 py-2.5 bg-red-800/60 hover:bg-red-700/70 border border-red-600/40 text-red-200 transition-colors"
        >
          <span>📞</span>
          <span>24h 热线</span>
        </button>
      </a>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 高校模式三合一面板
// ═══════════════════════════════════════════════════════════════════════
function UniversityPanels({
  onOpenGame,
}: {
  onOpenGame: (type: "muyu" | "typing") => void;
}) {
  return (
    <div className="space-y-3">
      <DailyHealingCapsule />
      <CyberRelaxZone onOpenGame={onOpenGame} />
      <CampusSupportCard />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 全屏游戏浮层（木鱼 + 打字发泄墙，状态完全自包含）
// ═══════════════════════════════════════════════════════════════════════

const FLYING_COLORS = ["#60a5fa","#34d399","#a78bfa","#f472b6","#fbbf24","#f87171","#38bdf8","#4ade80","#fb923c"];
interface FlyingChar { id: number; char: string; x: number; y: number; vx: number; vy: number; color: string; size: number; }

const MUYU_MILESTONES: Record<number, string> = {
  10: "初入佛门 🙏", 50: "小有精进 ✨", 100: "功德圆满 🌟",
  500: "慧根深厚 🪷", 999: "修成正果 🎊", 2000: "得道升仙 👼",
};

interface FloatingText { id: number; text: string; color: string; }

function GameOverlay({
  activeGame,
  onClose,
}: {
  activeGame: "muyu" | "typing";
  onClose: () => void;
}) {
  // ── 木鱼状态 ──────────────────────────────────────────────────────────
  const [meritCount, setMeritCount] = useState<number>(() => {
    try { return parseInt(localStorage.getItem("muyu_merit") || "0", 10) || 0; } catch { return 0; }
  });
  const [combo, setCombo] = useState(1);
  const [bounce, setBounce] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const lastClickRef = useRef(0);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStrike = useCallback(() => {
    const now = Date.now();
    const gap = now - lastClickRef.current;
    lastClickRef.current = now;
    const newCombo = gap < 800 ? combo + 1 : 1;
    setCombo(newCombo);
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => setCombo(1), 900);

    const bonus = newCombo >= 5 ? 3 : newCombo >= 3 ? 2 : 1;
    const next = meritCount + bonus;
    setMeritCount(next);
    try { localStorage.setItem("muyu_merit", String(next)); } catch {}

    setBounce(true);
    setTimeout(() => setBounce(false), 140);

    const milestone = MUYU_MILESTONES[next];
    const floatText = milestone
      ? milestone
      : newCombo >= 5 ? `🔥 +${bonus}`
      : newCombo >= 3 ? `⚡ +${bonus}`
      : `+${bonus}`;
    const floatColor = milestone ? "#fbbf24"
      : newCombo >= 5 ? "#f87171"
      : newCombo >= 3 ? "#fbbf24"
      : "#6ee7b7";
    const id = now + Math.random();
    setFloatingTexts((prev) => [...prev, { id, text: floatText, color: floatColor }]);
    setTimeout(() => setFloatingTexts((prev) => prev.filter((t) => t.id !== id)), 700);
  }, [combo, meritCount]);

  // ── 打字发泄墙状态 ─────────────────────────────────────────────────────
  const [flyingChars, setFlyingChars] = useState<FlyingChar[]>([]);
  const flyCharIdRef = useRef(0);
  const typingContainerRef = useRef<HTMLDivElement>(null);

  const handleTypingInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (!val) return;
    const container = typingContainerRef.current;
    const cw = container?.offsetWidth ?? 440;
    const ch = container?.offsetHeight ?? 180;
    const newChars: FlyingChar[] = val.split("").map((char) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 150;
      return {
        id: ++flyCharIdRef.current,
        char,
        x: cw / 2 + (Math.random() - 0.5) * 80,
        y: ch / 2,
        vx: Math.cos(angle) * speed,
        vy: -(Math.abs(Math.sin(angle)) * speed + 60),
        color: FLYING_COLORS[Math.floor(Math.random() * FLYING_COLORS.length)],
        size: 18 + Math.floor(Math.random() * 28),
      };
    });
    setFlyingChars((prev) => [...prev, ...newChars]);
    const ids = newChars.map((c) => c.id);
    setTimeout(() => setFlyingChars((prev) => prev.filter((c) => !ids.includes(c.id))), 950);
    e.target.value = "";
  };

  // ── 渲染 ───────────────────────────────────────────────────────────────
  const glowColor = combo >= 5
    ? "0 0 60px rgba(248,113,113,0.5), 0 0 120px rgba(248,113,113,0.2)"
    : combo >= 3
    ? "0 0 50px rgba(251,191,36,0.45), 0 0 100px rgba(251,191,36,0.2)"
    : "0 0 40px rgba(251,191,36,0.25)";

  return (
    <>
      <style>{`
        @keyframes ark-fly-pc {
          0%   { transform: translate(0,0) scale(1);   opacity: 1; }
          100% { transform: translate(var(--vx),var(--vy)) scale(0.1); opacity: 0; }
        }
        @keyframes ark-float-up {
          0%   { transform: translateY(0)  scale(1);   opacity: 1; }
          100% { transform: translateY(-70px) scale(0.8); opacity: 0; }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
        style={{ background: "rgba(2,6,23,0.92)", backdropFilter: "blur(8px)" }}
      >
        {/* 退出按钮 */}
        <button
          onClick={onClose}
          className={cn(
            "absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium",
            "border transition-all duration-200",
            "border-slate-600 text-slate-400 hover:border-red-500 hover:text-red-400 hover:bg-red-500/10"
          )}
        >
          <X size={16} />
          退出游乐区
        </button>

        {/* ── 木鱼 ── */}
        {activeGame === "muyu" && (
          <div className="flex flex-col items-center gap-6 select-none">
            {/* 功德计数 */}
            <div className="text-center">
              <p className="text-sm mb-1" style={{ color: "rgba(110,231,183,0.6)" }}>累计功德</p>
              <p
                className="text-7xl font-black tabular-nums"
                style={{
                  color: "#6ee7b7",
                  textShadow: "0 0 30px rgba(110,231,183,0.6), 0 0 60px rgba(110,231,183,0.3)",
                }}
              >
                {meritCount.toLocaleString()}
              </p>
            </div>

            {/* 连击提示 */}
            <div className="h-6 flex items-center justify-center">
              {combo >= 3 && (
                <span
                  className="text-sm font-bold px-3 py-0.5 rounded-full"
                  style={{
                    color: combo >= 5 ? "#f87171" : "#fbbf24",
                    background: combo >= 5 ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.12)",
                    border: `1px solid ${combo >= 5 ? "rgba(248,113,113,0.3)" : "rgba(251,191,36,0.25)"}`,
                  }}
                >
                  {combo >= 5 ? "🔥" : "⚡"} 连击 ×{combo}
                </span>
              )}
            </div>

            {/* 木鱼主体 */}
            <div className="relative flex items-center justify-center">
              {/* 浮字 */}
              {floatingTexts.map((ft) => (
                <div
                  key={ft.id}
                  className="absolute font-bold text-lg pointer-events-none whitespace-nowrap"
                  style={{
                    top: -20,
                    color: ft.color,
                    animation: "ark-float-up 0.65s ease-out forwards",
                  }}
                >
                  {ft.text}
                </div>
              ))}
              <button
                onClick={handleStrike}
                className={cn(
                  "w-56 h-56 rounded-3xl flex items-center justify-center text-8xl",
                  "cursor-pointer bg-gradient-to-br from-amber-700 via-amber-800 to-amber-900",
                  "border-4 border-amber-600"
                )}
                style={{
                  transform: bounce ? "scale(0.82)" : "scale(1)",
                  transition: "transform 0.14s cubic-bezier(.36,.07,.19,.97)",
                  boxShadow: `inset 0 -8px 20px rgba(0,0,0,0.4), inset 0 8px 20px rgba(255,255,255,0.1), ${glowColor}`,
                }}
              >
                🪵
              </button>
            </div>

            <p className="text-sm" style={{ color: "rgba(110,231,183,0.4)" }}>
              快速连击有加成 · 功德永久保存 🌿
            </p>
          </div>
        )}

        {/* ── 打字发泄墙 ── */}
        {activeGame === "typing" && (
          <div className="flex flex-col items-center gap-5" style={{ width: 440 }}>
            <div className="text-center">
              <p className="text-base font-semibold" style={{ color: "#c4b5fd" }}>有什么话，打出来</p>
              <p className="text-sm mt-1" style={{ color: "rgba(196,181,253,0.4)" }}>骂几句也没关系 🤫 没人看到</p>
            </div>
            <div ref={typingContainerRef} className="relative w-full rounded-2xl" style={{ height: 180 }}>
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                {flyingChars.map((c) => (
                  <span
                    key={c.id}
                    className="absolute font-bold pointer-events-none"
                    style={{
                      left: c.x, top: c.y, color: c.color, fontSize: c.size, lineHeight: 1,
                      ["--vx" as string]: `${c.vx}px`,
                      ["--vy" as string]: `${c.vy}px`,
                      animation: "ark-fly-pc 0.9s ease-out forwards",
                    }}
                  >
                    {c.char}
                  </span>
                ))}
              </div>
              <textarea
                className="absolute inset-0 w-full h-full rounded-2xl p-4 text-base text-white placeholder-white/20 resize-none focus:outline-none"
                style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)" }}
                placeholder="随便写，写完自动消失..."
                autoFocus
                onChange={handleTypingInput}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 老友收音机（社区模式） — 受控组件
// ═══════════════════════════════════════════════════════════════════════
function RadioCard({
  activeRadio,
  onPlay,
}: {
  activeRadio: RadioTrack | null;
  onPlay: (track: RadioTrack) => void;
}) {
  return (
    <Card className="rounded-2xl overflow-hidden" style={{ borderColor: "var(--panel-border)" }}>
      <CardHeader className="pb-3" style={{ background: "var(--card-bg)" }}>
        <CardTitle className="text-base font-bold flex items-center gap-2" style={{ color: "var(--accent-cyan)" }}>
          <span className="text-lg">📻</span>
          老友收音机
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" style={{ background: "var(--card-bg)" }}>
        {RADIO_ITEMS.map((item) => {
          const isActive = activeRadio === item.track;
          return (
            <button
              key={item.track}
              onClick={() => onPlay(item.track)}
              className="w-full rounded-xl py-4 px-4 text-base font-medium flex items-center gap-3 transition-all"
              style={{
                background: isActive ? "rgba(249,115,22,0.18)" : "rgba(6,182,212,0.1)",
                border: isActive ? "1px solid rgba(249,115,22,0.45)" : "1px solid rgba(6,182,212,0.25)",
                color: isActive ? "#ea580c" : "var(--accent-cyan)",
                fontWeight: isActive ? 700 : 500,
              }}
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="text-lg">
                {isActive ? "⏸️ " : "▶️ "}
                {isActive ? item.playingText : item.playText}
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 全家福卡片
// ═══════════════════════════════════════════════════════════════════════
function FamilyPhotoCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden border"
      style={{ borderColor: "var(--panel-border)" }}
    >
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
        <img
          src="/images/families.jpg"
          alt="温馨全家福"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
      <div className="p-4" style={{ background: "var(--card-bg)" }}>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          家人的爱，是最温暖的港湾 ❤️
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 右侧面板
// ═══════════════════════════════════════════════════════════════════════
export function RightPanel() {
  const { scenario } = useScenario();
  const [activeRadio, setActiveRadio] = useState<RadioTrack | null>(null);
  const [activeGame, setActiveGame] = useState<"muyu" | "typing" | null>(null);

  const radioAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleOpenGame = useCallback((type: "muyu" | "typing") => {
    setActiveGame(type);
  }, []);

  const handleCloseGame = useCallback(() => {
    setActiveGame(null);
  }, []);

  /* ── 播放控制逻辑 ── */
  const handleRadioPlay = (track: RadioTrack) => {
    if (radioAudioRef.current) {
      radioAudioRef.current.pause();
      radioAudioRef.current = null;
    }
    if (activeRadio === track) {
      setActiveRadio(null);
      return;
    }
    const audio = new Audio(`/sounds/${track}.mp3`);
    audio.addEventListener("ended", () => setActiveRadio(null));
    audio.play();
    radioAudioRef.current = audio;
    setActiveRadio(track);
  };

  /* ── 组件卸载时清理音频 ── */
  useEffect(() => {
    return () => {
      if (radioAudioRef.current) {
        radioAudioRef.current.pause();
        radioAudioRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <aside
        className="h-full flex flex-col overflow-hidden flex-shrink-0"
        style={{
          background: "var(--panel-bg)",
          borderLeft: "1px solid var(--panel-border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          className="px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--panel-border)" }}
        >
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {scenario === "university" ? "⚡ 快捷操作" : "🆘 亲情与安全"}
          </p>
        </div>

        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-3">
            {scenario === "university" ? (
              <UniversityPanels onOpenGame={handleOpenGame} />
            ) : (
              <>
                <FamilyPhotoCard />
                <RadioCard activeRadio={activeRadio} onPlay={handleRadioPlay} />
              </>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* 全屏游戏浮层 */}
      {activeGame && (
        <GameOverlay
          activeGame={activeGame}
          onClose={handleCloseGame}
        />
      )}
    </>
  );
}
