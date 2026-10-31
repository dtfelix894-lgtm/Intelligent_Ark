"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  CloudRain,
  Headphones,
  Moon,
  Music,
  Pause,
  Piano,
  Play,
  Timer,
  Trees,
  Volume2,
  Waves,
  Zap,
} from "lucide-react";
import { BreathingGuide } from "./BreathingGuide";

type Mood = "focus" | "relax" | "sleep";

type Track = {
  id: string;
  title: string;
  subtitle: string;
  src: string;
  mood: Mood;
  icon: typeof Piano;
  loop?: boolean;
  sourceNote: string;
};

type Ambience = {
  id: string;
  title: string;
  src: string;
  icon: typeof CloudRain;
  loop: boolean;
  sourceNote: string;
};

const MOODS: { id: Mood; label: string; icon: typeof Zap }[] = [
  { id: "focus", label: "提神", icon: Zap },
  { id: "relax", label: "放松", icon: Piano },
  { id: "sleep", label: "入睡", icon: Moon },
];

const RADIO_TRACKS: Track[] = [
  {
    id: "medal-focus",
    title: "勋章",
    subtitle: "轻激励 · 提神",
    src: "/sounds/medal.mp3",
    mood: "focus",
    icon: Music,
    loop: false,
    sourceNote: "勋章",
  },
  {
    id: "forest-focus",
    title: "林间晨声",
    subtitle: "自然环境音 · 提神",
    src: "/sounds/forest.mp3",
    mood: "focus",
    icon: Trees,
    loop: true,
    sourceNote: "自然环境音",
  },
  {
    id: "lemon-tree-relax",
    title: "Lemon Tree",
    subtitle: "轻快节奏 · 放松",
    src: "/sounds/lemon-tree.mp3",
    mood: "relax",
    icon: Music,
    loop: false,
    sourceNote: "Lemon Tree",
  },
  {
    id: "piano-relax",
    title: "钢琴纯音",
    subtitle: "轻音乐床 · 放松",
    src: "/sounds/piano.mp3",
    mood: "relax",
    icon: Piano,
    loop: true,
    sourceNote: "钢琴纯音（无歌词）",
  },
  {
    id: "piano-sleep",
    title: "夜色钢琴",
    subtitle: "轻音乐床 · 入睡",
    src: "/sounds/piano.mp3",
    mood: "sleep",
    icon: Moon,
    loop: true,
    sourceNote: "钢琴纯音（无歌词）",
  },
  {
    id: "meditation-sleep",
    title: "柔和垫底",
    subtitle: "冥想音色 · 入睡",
    src: "/sounds/meditation.mp3",
    mood: "sleep",
    icon: Brain,
    loop: true,
    sourceNote: "柔和冥想音色",
  },
];

const AMBIENCE: Ambience[] = [
  {
    id: "rain",
    title: "雨声",
    src: "/sounds/rain-loop.wav",
    icon: CloudRain,
    loop: true,
    sourceNote: "循环雨声",
  },
  {
    id: "wave",
    title: "海浪",
    src: "/sounds/wave.mp3",
    icon: Waves,
    loop: true,
    sourceNote: "海浪环境音",
  },
  {
    id: "forest",
    title: "森林",
    src: "/sounds/forest.mp3",
    icon: Trees,
    loop: true,
    sourceNote: "自然环境音",
  },
];

const SLEEP_TIMERS = [15, 30] as const;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AudioWellness({
  idPrefix = "wellness",
  preferredMood,
  highlightBreathing = false,
}: {
  idPrefix?: string;
  preferredMood?: Mood;
  highlightBreathing?: boolean;
}) {
  const radioRef = useRef<HTMLAudioElement | null>(null);
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const [mood, setMood] = useState<Mood>(preferredMood || "relax");
  const [trackId, setTrackId] = useState<string>("piano-relax");
  useEffect(() => {
    if (preferredMood) {
      setMood(preferredMood);
      const first = RADIO_TRACKS.find((t) => t.mood === preferredMood);
      if (first) setTrackId(first.id);
    }
  }, [preferredMood]);
  const [ambienceId, setAmbienceId] = useState<string | null>(null);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [ambiencePlaying, setAmbiencePlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [ambienceVolume, setAmbienceVolume] = useState(0.55);
  const [sleepMinutes, setSleepMinutes] = useState<(typeof SLEEP_TIMERS)[number] | null>(null);
  const [sleepLeft, setSleepLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const sleepEndsAt = useRef<number | null>(null);

  const tracks = useMemo(() => RADIO_TRACKS.filter((t) => t.mood === mood), [mood]);
  const activeTrack = RADIO_TRACKS.find((t) => t.id === trackId) || tracks[0] || RADIO_TRACKS[0];
  const activeAmbience = AMBIENCE.find((a) => a.id === ambienceId) || null;

  useEffect(() => {
    if (!tracks.some((t) => t.id === trackId)) {
      setTrackId(tracks[0]?.id || RADIO_TRACKS[0].id);
      setRadioPlaying(false);
    }
  }, [mood, tracks, trackId]);

  useEffect(() => {
    const audio = radioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = ambienceRef.current;
    if (!audio) return;
    audio.volume = ambienceVolume;
  }, [ambienceVolume, ambienceId]);

  useEffect(() => {
    return () => {
      radioRef.current?.pause();
      ambienceRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (sleepMinutes == null) {
      sleepEndsAt.current = null;
      setSleepLeft(null);
      return;
    }
    sleepEndsAt.current = Date.now() + sleepMinutes * 60 * 1000;
    setSleepLeft(sleepMinutes * 60);
    const timer = window.setInterval(() => {
      const ends = sleepEndsAt.current;
      if (!ends) return;
      const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      setSleepLeft(left);
      if (left <= 0) {
        radioRef.current?.pause();
        ambienceRef.current?.pause();
        setRadioPlaying(false);
        setAmbiencePlaying(false);
        setSleepMinutes(null);
        sleepEndsAt.current = null;
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [sleepMinutes]);

  async function playRadio(id: string) {
    const audio = radioRef.current;
    if (!audio) return;
    setError("");
    setTrackId(id);
    // allow src swap to settle
    window.setTimeout(async () => {
      const node = radioRef.current;
      if (!node) return;
      try {
        const track = RADIO_TRACKS.find((t) => t.id === id);
        node.loop = track?.loop ?? true;
        await node.play();
        setRadioPlaying(true);
      } catch {
        setError("浏览器暂时无法播放电台音频，请再次点击或检查媒体权限。");
        setRadioPlaying(false);
      }
    }, 0);
  }

  function toggleRadio() {
    const audio = radioRef.current;
    if (!audio) return;
    if (radioPlaying) {
      audio.pause();
      setRadioPlaying(false);
      return;
    }
    void playRadio(activeTrack.id);
  }

  async function toggleAmbience(id: string) {
    setError("");
    if (ambienceId === id && ambiencePlaying) {
      ambienceRef.current?.pause();
      setAmbiencePlaying(false);
      return;
    }
    setAmbienceId(id);
    window.setTimeout(async () => {
      const node = ambienceRef.current;
      if (!node) return;
      try {
        node.loop = true;
        await node.play();
        setAmbiencePlaying(true);
      } catch {
        setError("浏览器暂时无法播放环境音，请再次点击或检查媒体权限。");
        setAmbiencePlaying(false);
      }
    }, 0);
  }

  function onSeek(value: number) {
    const audio = radioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    audio.currentTime = value;
    setProgress(value);
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${idPrefix}-energy-radio-title`}>
        <div className="mb-3 flex items-center gap-2">
          <Headphones className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          <h3 id={`${idPrefix}-energy-radio-title`} className="font-semibold">
            能量补给电台
          </h3>
        </div>
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          按心情选曲，点击即可播放；完整歌曲播完会停止，环境音与纯音可循环。
        </p>

        <div className="mb-3 grid grid-cols-3 gap-2">
          {MOODS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMood(id)}
              aria-pressed={mood === id}
              className={`ark-interactive inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold ${
                mood === id
                  ? "border-emerald-300 bg-emerald-100 text-emerald-950"
                  : "border-border bg-white hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {tracks.map((track) => {
            const Icon = track.icon;
            const active = track.id === activeTrack.id;
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => void playRadio(track.id)}
                aria-pressed={active && radioPlaying}
                className={`ark-interactive flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-left ${
                  active
                    ? "border-emerald-200 bg-emerald-50/80"
                    : "border-emerald-100 bg-emerald-50/40 hover:bg-emerald-100/60"
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-700">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-emerald-950">{track.title}</span>
                  <span className="block truncate text-xs text-emerald-800">{track.subtitle}</span>
                </span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-700 text-white">
                  {active && radioPlaying ? (
                    <Pause className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-2xl border border-emerald-100 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{activeTrack.title}</p>
              <p className="truncate text-xs text-muted-foreground">{activeTrack.sourceNote}</p>
            </div>
            <button
              type="button"
              onClick={toggleRadio}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-700 text-white"
              aria-label={radioPlaying ? "暂停电台" : "播放电台"}
            >
              {radioPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="w-10 text-xs tabular-nums text-muted-foreground">{formatTime(progress)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.1}
              value={Math.min(progress, duration || 0)}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="h-2 w-full accent-emerald-700"
              aria-label="播放进度"
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-2 w-full accent-emerald-700"
              aria-label="电台音量"
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(volume * 100)}%
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Timer className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <span className="text-xs font-semibold text-emerald-900">定时关闭</span>
            {SLEEP_TIMERS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSleepMinutes((cur) => (cur === m ? null : m))}
                className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold ${
                  sleepMinutes === m
                    ? "bg-emerald-700 text-white"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-950"
                }`}
              >
                {m} 分钟
              </button>
            ))}
            {sleepLeft != null && sleepMinutes != null && (
              <span className="text-xs text-muted-foreground">剩余 {formatTime(sleepLeft)}</span>
            )}
          </div>
        </div>

        <audio
          ref={radioRef}
          src={activeTrack.src}
          preload="metadata"
          loop={activeTrack.loop ?? true}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onPlay={() => setRadioPlaying(true)}
          onPause={() => setRadioPlaying(false)}
          onEnded={() => setRadioPlaying(false)}
        />
      </section>

      <section aria-labelledby={`${idPrefix}-mindfulness-title`}>
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 id={`${idPrefix}-mindfulness-title`} className="font-semibold">
            正念放松站
          </h3>
        </div>
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          冥想以呼吸引导为主；雨声 / 海浪 / 森林可作背景环境音，互不替代。
        </p>

        <div className={highlightBreathing ? "rounded-2xl ring-2 ring-sky-300 ring-offset-2" : undefined}>
          <BreathingGuide defaultMinutes={preferredMood === "sleep" ? 5 : 3} defaultPattern={preferredMood === "sleep" ? "calm" : "478"} />
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold">环境音（可选）</p>
          <div className="grid grid-cols-3 gap-2">
            {AMBIENCE.map(({ id, title, icon: Icon }) => {
              const active = ambienceId === id && ambiencePlaying;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => void toggleAmbience(id)}
                  aria-pressed={active}
                  className={`ark-interactive flex min-h-20 flex-col items-start justify-between rounded-xl border p-3 text-left ${
                    active ? "border-primary/40 bg-secondary" : "border-border bg-white hover:bg-secondary/60"
                  }`}
                >
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <span className="flex w-full items-center justify-between text-sm font-semibold">
                    <span>{title}</span>
                    {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </span>
                </button>
              );
            })}
          </div>
          {activeAmbience && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2">
              <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="shrink-0 text-xs text-muted-foreground">{activeAmbience.title}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={ambienceVolume}
                onChange={(e) => setAmbienceVolume(Number(e.target.value))}
                className="h-2 w-full accent-violet-700"
                aria-label="环境音音量"
              />
            </div>
          )}
          {activeAmbience && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">来源：{activeAmbience.sourceNote}</p>
          )}
        </div>

        {ambienceId && (
          <audio
            key={ambienceId}
            ref={ambienceRef}
            src={AMBIENCE.find((a) => a.id === ambienceId)?.src}
            preload="metadata"
            loop
            onPlay={() => setAmbiencePlaying(true)}
            onPause={() => setAmbiencePlaying(false)}
          />
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
