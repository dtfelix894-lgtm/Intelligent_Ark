"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useScenario } from "@/lib/scenario-context";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { ExternalLink } from "lucide-react";

// ─── 声音类型 ────────────────────────────────────────────────────────────────
type SoundType = "rain" | "wave" | "forest" | "meditation";

// ─── 能量补给电台 ───────────────────────────────────────────────────────────
const SONGS = [
  { id: "medal", name: "勋章" },
  { id: "lemon-tree", name: "Lemon Tree" },
  { id: "piano", name: "钢琴纯音" },
];

function EnergyRadioStation({
  playingSong,
  onPlay,
}: {
  playingSong: string | null;
  onPlay: (songId: string) => void;
}) {
  return (
    <Card className="rounded-2xl overflow-hidden" style={{ borderColor: "var(--panel-border)" }}>
      <CardHeader className="pb-2" style={{ background: "var(--card-bg)" }}>
        <CardTitle
          className="text-sm font-bold flex items-center gap-2"
          style={{ color: "var(--accent-emerald)" }}
        >
          <span className="text-lg">🎧</span>
          能量补给电台
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2" style={{ background: "var(--card-bg)" }}>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          戴上耳机，重新找回向上的力量 ✨
        </p>

        <div className="flex flex-col gap-2">
          {SONGS.map((song) => {
            const active = playingSong === song.id;
            return (
              <button
                key={song.id}
                onClick={() => onPlay(song.id)}
                className={cn(
                  "w-full flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-all",
                  active
                    ? "bg-emerald-500/15 border border-emerald-500/30"
                    : "bg-slate-800/30 border border-slate-700/40 hover:bg-slate-700/30"
                )}
              >
                <span
                  className={cn(
                    "text-sm font-medium text-left transition-colors",
                    active ? "text-emerald-300" : "text-slate-300"
                  )}
                >
                  {song.name}
                </span>

                <div className="flex items-end gap-0.5 h-4">
                  {active ? (
                    <>
                      <div
                        className="w-1 rounded-sm bg-emerald-400 animate-eq-bar-1"
                        style={{ height: "40%" }}
                      />
                      <div
                        className="w-1 rounded-sm bg-emerald-400 animate-eq-bar-2"
                        style={{ height: "70%" }}
                      />
                      <div
                        className="w-1 rounded-sm bg-emerald-400 animate-eq-bar-3"
                        style={{ height: "55%" }}
                      />
                    </>
                  ) : (
                    <span className="text-slate-500 text-xs">▶</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 正念放松站 ─────────────────────────────────────────────────────────────
type BreathPhase = "inhale" | "hold" | "exhale" | "rest";

function MindfulnessStation({
  playingRelax,
  onSoundToggle,
}: {
  playingRelax: string | null;
  onSoundToggle: (type: SoundType) => void;
}) {
  const [phase, setPhase] = useState<BreathPhase>("inhale");

  const SOUNDS: { icon: string; label: string; type: SoundType }[] = [
    { icon: "🌧️", label: "雨声", type: "rain" },
    { icon: "🌊", label: "海浪", type: "wave" },
    { icon: "🍃", label: "森林", type: "forest" },
    { icon: "🧘", label: "冥想", type: "meditation" },
  ];

  useEffect(() => {
    const cycle: Record<BreathPhase, { next: BreathPhase; ms: number }> = {
      inhale: { next: "hold", ms: 4000 },
      hold: { next: "exhale", ms: 4000 },
      exhale: { next: "rest", ms: 6000 },
      rest: { next: "inhale", ms: 2000 },
    };
    const t = setTimeout(() => setPhase(cycle[phase].next), cycle[phase].ms);
    return () => clearTimeout(t);
  }, [phase]);

  const phaseLabel =
    phase === "inhale" ? "吸气..." : phase === "hold" ? "屏息..." : phase === "exhale" ? "呼气..." : "休息...";

  const circleScale =
    phase === "inhale" ? "scale-110" : phase === "exhale" ? "scale-90" : "scale-100";

  return (
    <Card className="rounded-2xl overflow-hidden" style={{ borderColor: "var(--panel-border)" }}>
      <CardHeader className="pb-3" style={{ background: "var(--card-bg)" }}>
        <CardTitle className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--accent-purple)" }}>
          <span className="text-lg">🧘</span>
          正念放松站
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4" style={{ background: "var(--card-bg)" }}>
        <div className="flex flex-col items-center gap-3 py-2">
          <div
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-[4s]",
              circleScale
            )}
            style={{ background: "rgba(168,85,247,0.2)" }}
          >
            <div
              className="w-14 h-14 rounded-full breathe-animate"
              style={{ background: "rgba(168,85,247,0.4)" }}
            />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--accent-purple)" }}>
            {phaseLabel}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SOUNDS.map((s) => (
            <button
              key={s.type}
              onClick={() => onSoundToggle(s.type)}
              className="rounded-xl py-2 px-2 text-xs text-left transition-all active:scale-95 relative overflow-hidden"
              style={{
                background: playingRelax === s.type ? "rgba(168,85,247,0.35)" : "rgba(168,85,247,0.15)",
                color: playingRelax === s.type ? "#e9d5ff" : "rgba(168,85,247,0.8)",
                border: "1px solid rgba(168,85,247,0.2)",
              }}
            >
              <span>{s.icon}</span> {s.label}
              {playingRelax === s.type && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 学业解压锦囊 Mock 数据 ──────────────────────────────────────────────────
type StressItem = { text: string; actionText?: string; actionLink?: string };
type StressCategory = { icon: string; title: string; bgColor: string; items: StressItem[] };

const stressReliefData: Record<string, StressCategory> = {
  "考研": {
    icon: "📚", title: "考研", bgColor: "bg-orange-50/60",
    items: [
      { text: "允许自己偶尔崩溃，但不要放弃。你的价值绝对不会由一张成绩单来定义。今天去吃顿好的吧！", actionText: "教育部考研心理疏导指南", actionLink: "https://yz.chsi.com.cn/" },
      { text: "考研只是一段路，不是整个人生。考上了是惊喜，没考上也不代表你不够好。你已经很努力了 💪", actionText: "院校心理援助资源库", actionLink: "https://yz.chsi.com.cn/" },
      { text: "别忘了，复习累了就出去走走。阳光、大树和清风，都是免费的治愈系好物。抬头看看天吧！", actionText: "教育部考研心理疏导指南", actionLink: "https://yz.chsi.com.cn/" },
    ],
  },
  "就业": {
    icon: "💼", title: "就业", bgColor: "bg-blue-50/60",
    items: [
      { text: "不要用别人的进度条来衡量自己的人生。春招秋招的每一次拒绝，都是在帮你排除不适合的错误选项。", actionText: "国家大学生就业服务平台", actionLink: "https://www.ncss.cn/" },
      { text: "第一份工作不完美没关系，就像第一件毛衣总会有点起球，但你会越织越顺手的。", actionText: "就业权益保障指南", actionLink: "https://www.ncss.cn/" },
      { text: "简历石沉大海不是你的问题，是市场还没看见你。继续保持耐心，你的光芒不会一直被埋没 ✨", actionText: "国家大学生就业服务平台", actionLink: "https://www.ncss.cn/" },
    ],
  },
  "科研": {
    icon: "🔬", title: "科研", bgColor: "bg-purple-50/60",
    items: [
      { text: "实验数据跑不出、论文退稿是科研的常态。有时候闭门造车不如多看看学校的前沿资源和学术讲座，换个思路也许豁然开朗。", actionText: "🏫 保定学院科研学术资源", actionLink: "https://www.bdu.edu.cn/" },
      { text: "文献看不懂是正常的，你不需要记住所有东西。你只需要学会找到答案，就已经很棒了。", actionText: "🏫 保定学院科研学术资源", actionLink: "https://www.bdu.edu.cn/" },
      { text: "导师的批评不等于你不够好，那只是他们表达期待的方式。深呼吸，科研是一场马拉松，不是冲刺 🏃", actionText: "🏫 保定学院科研学术资源", actionLink: "https://www.bdu.edu.cn/" },
    ],
  },
  "期末": {
    icon: "📝", title: "期末", bgColor: "bg-emerald-50/60",
    items: [
      { text: "平时没学好？别慌，不到最后一刻绝不认输！深呼吸，打开最高效的速成课，一晚上创造奇迹！", actionText: "🎬 B站期末速成救命指南", actionLink: "https://search.bilibili.com/all?keyword=期末速成" },
      { text: "通宵复习伤身又伤脑，不如早点睡觉。良好的睡眠才能让第二天脑子更清醒、效率更高哦！", actionText: "🎬 B站期末速成救命指南", actionLink: "https://search.bilibili.com/all?keyword=期末速成" },
      { text: "考试紧张的时候，试试深呼吸：吸气4秒，屏住4秒，呼气4秒。你的大脑需要氧气，不是焦虑 😮‍💨", actionText: "🎬 B站期末速成救命指南", actionLink: "https://search.bilibili.com/all?keyword=期末速成" },
    ],
  },
};

// ─── 学业解压锦囊弹窗 ───────────────────────────────────────────────────────
function StressReliefDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const categories = Object.keys(stressReliefData);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0"
        style={{
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(6,182,212,0.2)",
          borderRadius: "1.5rem",
        }}
      >
        <DialogHeader className="px-8 pt-7 pb-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(6,182,212,0.1)" }}>
          <DialogTitle className="flex items-center gap-3 text-xl font-bold" style={{ color: "#0f172a" }}>
            <span className="text-3xl">📖</span>
            <div>
              <div>智伴解压锦囊</div>
              <div className="text-sm font-normal text-slate-400 mt-0.5">
                专治各种考研 / 就业 / 科研 / 期末焦虑 ✨
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <Tabs defaultValue={categories[0]} className="w-full mt-4">
            <TabsList
              className="w-full grid mb-5 rounded-full p-1"
              style={{
                background: "rgba(6,182,212,0.07)",
                gridTemplateColumns: `repeat(${categories.length}, 1fr)`,
              }}
            >
              {categories.map((cat) => (
                <TabsTrigger
                  key={cat}
                  value={cat}
                  className="rounded-full text-sm font-medium transition-all py-1.5 data-[state=active]:shadow-sm"
                  style={{ color: "#64748b" }}
                >
                  <span className="mr-1">{stressReliefData[cat].icon}</span>
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((cat) => {
              const data = stressReliefData[cat];
              return (
                <TabsContent key={cat} value={cat} className="mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    {data.items.map((item, idx) => (
                      <Card
                        key={idx}
                        className={cn("rounded-2xl p-5 shadow-sm border flex flex-col", data.bgColor)}
                        style={{ borderColor: "rgba(0,0,0,0.05)", color: "#374151", fontSize: "0.875rem", lineHeight: "1.75" }}
                      >
                        <p className="leading-relaxed flex-1">{item.text}</p>
                        {item.actionLink && item.actionText && (
                          <div className="mt-4 flex justify-end">
                            <a href={item.actionLink} target="_blank" rel="noopener noreferrer" className="no-underline">
                              <Button variant="outline" size="sm">
                                {item.actionText}
                                <ExternalLink className="w-3 h-3 ml-1" />
                              </Button>
                            </a>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 贴心日程（社区模式） ──────────────────────────────────────────────────
function DailySchedule({
  currentTime,
  isMedicineTaken,
  onMedicineTaken,
  isFootBathDone,
  onFootBathDone,
}: {
  currentTime: Date;
  isMedicineTaken: boolean;
  onMedicineTaken: () => void;
  isFootBathDone: boolean;
  onFootBathDone: () => void;
}) {
  const timeStr = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  const now = `${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}`;

  const newsBefore = now < "18:50";
  const newsWarning = now >= "18:50" && now < "19:00";
  const newsLive = now >= "19:00" && now < "19:30";
  const newsDone = now >= "19:30";

  const footbathRemind = !isFootBathDone && now >= "21:00";
  const footbathDone = isFootBathDone;

  const medIcon = isMedicineTaken ? "✅" : "💊";
  const medLabel = isMedicineTaken ? "已服药" : "晨间降压药";

  return (
    <Card className="rounded-2xl overflow-hidden" style={{ borderColor: "var(--panel-border)" }}>
      <CardHeader className="pb-3" style={{ background: "var(--card-bg)" }}>
        <CardTitle className="text-base font-bold flex items-center gap-2" style={{ color: "var(--accent-amber)" }}>
          <span className="text-lg">⏰</span>
          贴心日程
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" style={{ background: "var(--card-bg)" }}>

        <button
          disabled={isMedicineTaken}
          onClick={onMedicineTaken}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all",
            isMedicineTaken
              ? "bg-green-100 border border-green-200 cursor-not-allowed opacity-90"
              : "bg-slate-800/30 hover:bg-slate-700/40 cursor-pointer"
          )}
        >
          <span className="text-2xl flex-shrink-0">{medIcon}</span>
          <div className="flex-1 min-w-0">
            <p className={cn("text-base", isMedicineTaken ? "text-green-700 font-bold" : "text-slate-200")}>
              {medLabel}
            </p>
            <p className="text-sm font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
              {timeStr(8, 30)}
            </p>
          </div>
          {isMedicineTaken && <span className="text-green-500 text-lg flex-shrink-0">✓</span>}
        </button>

        {newsBefore && (
          <div className="flex items-center gap-3 rounded-xl p-3 bg-slate-800/30">
            <span className="text-2xl flex-shrink-0">📺</span>
            <div className="flex-1 min-w-0">
              <p className="text-base text-slate-200">今晚 19:00 有新闻联播哈 📺</p>
              <p className="text-sm font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{timeStr(18, 50)}</p>
            </div>
          </div>
        )}
        {newsWarning && (
          <div className="flex items-center gap-3 rounded-xl p-3 bg-orange-100 border border-orange-300 animate-pulse">
            <span className="text-2xl flex-shrink-0">📺</span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-orange-700">快打开电视，新闻联播还有10分钟开始啦！</p>
              <p className="text-sm font-mono mt-0.5 text-orange-600">{timeStr(18, 50)}</p>
            </div>
            <span className="text-orange-500 text-lg flex-shrink-0">●</span>
          </div>
        )}
        {newsLive && (
          <div className="flex items-center gap-3 rounded-xl p-3 bg-slate-800/30">
            <span className="text-2xl flex-shrink-0">📺</span>
            <div className="flex-1 min-w-0">
              <p className="text-base text-slate-200">新闻联播正在播出中...</p>
              <p className="text-sm font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{timeStr(19, 30)}</p>
            </div>
          </div>
        )}
        {newsDone && (
          <div className="flex items-center gap-3 rounded-xl p-3 bg-gray-100 border border-gray-200">
            <span className="text-2xl flex-shrink-0">📺</span>
            <div className="flex-1 min-w-0">
              <p className="text-base text-gray-400">今日新闻已结束</p>
              <p className="text-sm font-mono mt-0.5 text-gray-400">{timeStr(19, 30)}</p>
            </div>
          </div>
        )}

        <button
          disabled={isFootBathDone}
          onClick={onFootBathDone}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all",
            isFootBathDone
              ? "bg-green-100 border border-green-200 cursor-not-allowed opacity-90"
              : footbathRemind
              ? "bg-orange-100 border border-orange-300 cursor-pointer animate-pulse"
              : "bg-slate-800/30 hover:bg-slate-700/40 cursor-pointer"
          )}
        >
          <span className="text-2xl flex-shrink-0">{isFootBathDone ? "🌙" : "🛏️"}</span>
          <div className="flex-1 min-w-0">
            <p className={cn("text-base",
              isFootBathDone ? "text-green-700 font-bold"
                : footbathRemind ? "text-orange-700 font-bold"
                : "text-slate-200"
            )}>
              {isFootBathDone ? "已泡脚 🌙" : "睡前泡脚时间"}
            </p>
            <p className="text-sm font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
              {timeStr(21, 0)}
            </p>
          </div>
          {isFootBathDone && <span className="text-green-500 text-lg flex-shrink-0">✓</span>}
        </button>

      </CardContent>
    </Card>
  );
}

// ─── 实时时钟（社区模式底部） ───────────────────────────────────────────────
function RealTimeClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;
  const dayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const dayStr = dayNames[now.getDay()];
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="flex-shrink-0 px-4 py-4 border-t" style={{ background: "var(--panel-bg)", borderColor: "var(--panel-border)" }}>
      <p className="text-4xl font-bold tracking-wider mb-1" style={{ color: "var(--accent-amber)", lineHeight: 1 }}>
        {timeStr}
      </p>
      <p className="text-base font-medium mt-1" style={{ color: "var(--text-secondary)" }}>
        {dateStr} {dayStr}
      </p>
    </div>
  );
}

// ─── WMO 天气代码映射 ───────────────────────────────────────────────────────
type WeatherInfo = { icon: string; label: string };

function getWeatherInfo(code: number): WeatherInfo {
  if (code === 0) return { icon: "☀️", label: "晴" };
  if (code >= 1 && code <= 3) return { icon: "⛅", label: "多云" };
  if (code >= 45 && code <= 48) return { icon: "🌫️", label: "雾" };
  if (code === 51 || (code >= 61 && code <= 63)) return { icon: "🌧️", label: "雨" };
  if (code === 71 || code === 73) return { icon: "❄️", label: "雪" };
  return { icon: "🌤️", label: "未知" };
}

// ─── 生活关怀 ───────────────────────────────────────────────────────────────
function LifeCare() {
  const [weatherData, setWeatherData] = useState<{ icon: string; label: string; temp: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = (lat: number, lon: number) => {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
        .then((res) => res.json())
        .then((data) => {
          const code = data.current_weather?.weathercode ?? 0;
          const temp = data.current_weather?.temperature ?? 22;
          const info = getWeatherInfo(code);
          setWeatherData({ icon: info.icon, label: info.label, temp: Math.round(temp) });
        })
        .catch(() => { setWeatherData({ icon: "☀️", label: "晴", temp: 22 }); })
        .finally(() => setIsLoading(false));
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      () => { setWeatherData({ icon: "☀️", label: "晴", temp: 22 }); setIsLoading(false); }
    );
  }, []);

  return (
    <Card className="rounded-2xl overflow-hidden" style={{ borderColor: "var(--panel-border)" }}>
      <CardHeader className="pb-3" style={{ background: "var(--card-bg)" }}>
        <CardTitle className="text-base font-bold" style={{ color: "var(--accent-orange)" }}>
          🏡 生活关怀
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4" style={{ background: "var(--card-bg)" }}>
        <div className="flex items-center gap-4">
          {isLoading ? (
            <div className="text-5xl animate-pulse">☀️</div>
          ) : (
            <div className="text-5xl">{weatherData?.icon}</div>
          )}
          <div>
            <p className="text-2xl font-extrabold" style={{ color: "var(--accent-orange)", lineHeight: 1.2 }}>今日天气</p>
            {isLoading ? (
              <p className="text-xl font-bold" style={{ color: "var(--text-muted)", lineHeight: 1.2 }}>获取中...</p>
            ) : (
              <p className="text-2xl font-extrabold" style={{ color: "#292524", lineHeight: 1.2 }}>
                {weatherData?.label} {weatherData?.temp}°C
              </p>
            )}
          </div>
        </div>
        <div className="rounded-xl p-4 border-2" style={{ borderColor: "rgba(249,115,22,0.4)", background: "rgba(249,115,22,0.06)" }}>
          <p className="text-base font-bold mb-1" style={{ color: "#c2410c" }}>💊 温馨提醒</p>
          <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>高血压药记得吃</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 左侧面板主体 ────────────────────────────────────────────────────────────
export function LeftPanel({
  playingSong,
  handleSongPlay,
  playingRelax,
  onRelaxChange,
}: {
  playingSong: string | null;
  handleSongPlay: (songId: string) => void;
  playingRelax: string | null;
  onRelaxChange: (type: SoundType | null) => void;
}) {
  const { scenario } = useScenario();
  const [stressDialogOpen, setStressDialogOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 贴心日程时间引擎
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMedicineTaken, setIsMedicineTaken] = useState(false);
  const [isFootBathDone, setIsFootBathDone] = useState(false);

  // 实时时钟 + 日期变更自动重置日程
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      const prev = currentTime;
      if (
        prev.getFullYear() !== now.getFullYear() ||
        prev.getMonth() !== now.getMonth() ||
        prev.getDate() !== now.getDate()
      ) {
        setIsMedicineTaken(false);
        setIsFootBathDone(false);
      }
      setCurrentTime(now);
    }, 1000);
    return () => clearInterval(id);
  }, [currentTime]);

  // ── 正念放松站本地播放逻辑（持久化 audioRef，安全 play/cancel） ──
  const handleRelax = useCallback((type: SoundType) => {
    // 1. 如果点击当前正在播放的，则暂停
    if (playingRelax === type) {
      audioRef.current?.pause();
      audioRef.current = null;
      onRelaxChange(null);
      return;
    }

    // 2. 暂停其他所有放松音频（同一组件内只有这一个实例，无需跨组件处理）
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // 3. 创建并播放新音频
    const audio = new Audio(`/sounds/${type}.mp3`);
    audio.volume = 0.6;
    audio.loop = true;
    audioRef.current = audio;
    audio.addEventListener("ended", () => onRelaxChange(null));
    audio.play().catch((e) => console.error("浏览器阻止了音频播放:", e));
    onRelaxChange(type);
  }, [playingRelax, onRelaxChange]);

  // 清理音频 on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return (
    <>
      <aside
        className="h-full flex flex-col overflow-hidden flex-shrink-0"
        style={{
          background: "var(--panel-bg)",
          borderRight: "1px solid var(--panel-border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--panel-border)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {scenario === "university" ? "🎓 功能与数据" : "🏡 日常关怀"}
          </p>
        </div>

        <ScrollArea className="flex-1 px-4 py-3 !bg-transparent">
          <div className="space-y-3 !bg-transparent" style={{ background: "transparent !important" }}>
            {scenario === "university" ? (
              <>
                <EnergyRadioStation playingSong={playingSong} onPlay={handleSongPlay} />
                <MindfulnessStation playingRelax={playingRelax} onSoundToggle={handleRelax} />
                <Card
                  className="rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02]"
                  style={{ borderColor: "var(--panel-border)", background: "rgba(249,115,22,0.08)" }}
                  onClick={() => setStressDialogOpen(true)}
                >
                  <CardHeader className="pb-3" style={{ background: "transparent" }}>
                    <CardTitle className="text-sm font-bold flex items-center gap-2" style={{ color: "#ea580c" }}>
                      <span className="text-lg">📖</span>
                      智伴解压锦囊
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ background: "transparent" }}>
                    <p className="text-xs leading-relaxed" style={{ color: "#57534e" }}>
                      专治各种考研 / 就业 / 科研焦虑 🧠💆
                    </p>
                    <button
                      className="mt-3 w-full py-2 rounded-xl text-xs font-semibold transition-all animate-pulse"
                      style={{ background: "rgba(249,115,22,0.2)", color: "#c2410c", border: "1px solid rgba(249,115,22,0.3)" }}
                    >
                      打开锦囊 ✨
                    </button>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <LifeCare />
                <DailySchedule
                  currentTime={currentTime}
                  isMedicineTaken={isMedicineTaken}
                  onMedicineTaken={() => setIsMedicineTaken(true)}
                  isFootBathDone={isFootBathDone}
                  onFootBathDone={() => setIsFootBathDone(true)}
                />
              </>
            )}
          </div>
        </ScrollArea>

        {scenario === "community" && <RealTimeClock />}

        <StressReliefDialog open={stressDialogOpen} onOpenChange={setStressDialogOpen} />
      </aside>
    </>
  );
}
