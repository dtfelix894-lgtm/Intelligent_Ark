"use client";

import { useEffect, useRef, useState } from "react";
import { Award, Brain, CloudRain, Headphones, Music2, Pause, Piano, Play, Trees, Waves } from "lucide-react";

const songs = [
  { id: "medal", title: "勋章", subtitle: "鹿晗", src: "/sounds/medal.mp3", icon: Award },
  { id: "lemon-tree", title: "Lemon Tree", subtitle: "Fool's Garden", src: "/sounds/lemon-tree.mp3", icon: Music2 },
  { id: "piano", title: "钢琴纯音", subtitle: "轻音乐", src: "/sounds/piano.mp3", icon: Piano },
];

const ambience = [
  { id: "rain", title: "雨声", src: "/sounds/rain.mp3", icon: CloudRain, loop: true },
  { id: "wave", title: "海浪", src: "/sounds/wave.mp3", icon: Waves, loop: true },
  { id: "forest", title: "森林", src: "/sounds/forest.mp3", icon: Trees, loop: true },
  { id: "meditation", title: "冥想", src: "/sounds/meditation.mp3", icon: Brain, loop: false },
];

export function AudioWellness({ idPrefix = "wellness" }: { idPrefix?: string }) {
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => { Object.values(refs.current).forEach((audio) => audio?.pause()); }, []);

  async function toggle(id: string) {
    const target = refs.current[id];
    if (!target) return;
    setError("");
    if (playing === id) {
      target.pause();
      setPlaying(null);
      return;
    }
    Object.entries(refs.current).forEach(([key, audio]) => { if (audio && key !== id) { audio.pause(); audio.currentTime = 0; } });
    try {
      await target.play();
      setPlaying(id);
    } catch {
      setError("浏览器暂时无法播放该音频，请再次点击或检查媒体权限。");
    }
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${idPrefix}-energy-radio-title`}>
        <div className="mb-3 flex items-center gap-2"><Headphones className="h-5 w-5 text-emerald-700" aria-hidden="true" /><h3 id={`${idPrefix}-energy-radio-title`} className="font-semibold">能量补给电台</h3></div>
        <div className="space-y-2">{songs.map(({ id, title, subtitle, src, icon: Icon }) => <div key={id}><button type="button" onClick={() => toggle(id)} aria-pressed={playing === id} className="ark-interactive flex min-h-14 w-full items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 text-left hover:bg-emerald-100/70"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-700"><Icon className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-emerald-950">{title}</span><span className="block truncate text-xs text-emerald-800">{subtitle}</span></span><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-700 text-white">{playing === id ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />}</span></button><audio ref={(node) => { refs.current[id] = node; }} src={src} preload="metadata" onEnded={() => setPlaying((current) => current === id ? null : current)} /></div>)}</div>
      </section>

      <section aria-labelledby={`${idPrefix}-mindfulness-title`}>
        <div className="mb-3 flex items-center gap-2"><Brain className="h-5 w-5 text-primary" aria-hidden="true" /><h3 id={`${idPrefix}-mindfulness-title`} className="font-semibold">正念放松站</h3></div>
        <div className="grid grid-cols-2 gap-2">{ambience.map(({ id, title, src, icon: Icon, loop }) => <div key={id}><button type="button" onClick={() => toggle(id)} aria-pressed={playing === id} className={`ark-interactive flex min-h-20 w-full flex-col items-start justify-between rounded-xl border p-3 text-left ${playing === id ? "border-primary/40 bg-secondary" : "border-border bg-white hover:bg-secondary/60"}`}><Icon className="h-5 w-5 text-primary" aria-hidden="true" /><span className="flex w-full items-center justify-between text-sm font-semibold"><span>{title}</span>{playing === id ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}</span></button><audio ref={(node) => { refs.current[id] = node; }} src={src} preload="metadata" loop={loop} onEnded={() => setPlaying((current) => current === id ? null : current)} /></div>)}</div>
      </section>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  );
}
