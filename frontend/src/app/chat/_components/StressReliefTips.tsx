"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, BookOpen, Coffee, NotebookPen, Wind } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BreathingGuide } from "./BreathingGuide";

const categories = [
  {
    id: "breathing",
    label: "呼吸调节",
    icon: Wind,
    tips: [
      "优先使用下方可视化引导：选择 1/3/5 分钟，跟着圆圈节奏完成 4-7-8 或方块呼吸。",
      "双手放在腹部，吸气时鼓起、呼气时落下，把注意力放回身体。",
      "每天早晨先做一轮短引导，给一天的状态留出缓冲。",
    ],
  },
  {
    id: "movement",
    label: "身体活动",
    icon: Activity,
    tips: [
      "起身活动 5 分钟，伸展肩颈和腰背，缓解久坐疲劳。",
      "散步 10 分钟，接受自然光，把注意力放回身体。",
      "做一组轻量开合跳或原地踏步，让紧绷感慢慢松开。",
    ],
  },
  {
    id: "emotion",
    label: "情绪记录",
    icon: NotebookPen,
    tips: [
      "写下 3 件今天值得感激的小事。",
      "记录今天最有成就感的一件事，哪怕只是按时吃饭。",
      "给未来的自己写一小段话，描述你希望慢慢靠近的状态。",
    ],
  },
  {
    id: "life",
    label: "生活小确幸",
    icon: Coffee,
    tips: [
      "给自己冲一杯热饮，安静坐几分钟。",
      "整理一小块桌面，用可控的小事找回秩序感。",
      "听一首喜欢的歌，把这几分钟完整留给自己。",
    ],
  },
];

export function StressReliefTips({
  autoOpenToken = 0,
  highlighted = false,
}: {
  autoOpenToken?: number;
  highlighted?: boolean;
}) {
  const [category, setCategory] = useState(0);
  const [tip, setTip] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpenToken > 0) {
      setCategory(0); // 呼吸调节优先；考试场景也可看锦囊首页
      setOpen(true);
    }
  }, [autoOpenToken]);
  const active = categories[category];
  const isBreathing = active.id === "breathing";

  function choose(index: number) {
    setCategory(index);
    setTip(0);
  }

  function next() {
    setTip((current) => (current + 1) % active.tips.length);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`ark-interactive flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left text-amber-950 hover:bg-amber-100 ${highlighted ? "border-amber-400 bg-amber-100 ring-2 ring-amber-300 ring-offset-2" : "border-amber-200 bg-amber-50"}`}
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-amber-700">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">学业解压锦囊</span>
            <span className="block text-xs text-amber-800">一条现在就能做的小建议</span>
          </span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-5 sm:p-7">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <BookOpen className="h-5 w-5 text-amber-700" aria-hidden="true" />
            学业解压锦囊
          </DialogTitle>
          <DialogDescription className="leading-6">
            不用一次解决所有压力，先选一个现在做得到的小动作。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {categories.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              type="button"
              onClick={() => choose(index)}
              aria-pressed={category === index}
              className={`ark-interactive min-h-20 rounded-xl border p-3 text-sm font-semibold ${
                category === index
                  ? "border-primary/30 bg-secondary text-primary"
                  : "border-border bg-white hover:bg-muted"
              }`}
            >
              <Icon className="mx-auto mb-2 h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {isBreathing ? (
          <div className="space-y-3">
            <BreathingGuide compact defaultPattern="478" defaultMinutes={1} />
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                {active.label} · 小提示 {tip + 1}/{active.tips.length}
              </p>
              <p className="mt-2 text-sm leading-7 text-amber-950">{active.tips[tip]}</p>
              <button
                type="button"
                onClick={next}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-700 px-3 text-sm font-semibold text-white hover:bg-amber-800"
              >
                换一条提示 <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              {active.label} · {tip + 1}/{active.tips.length}
            </p>
            <p className="mt-3 text-base leading-8 text-amber-950">{active.tips[tip]}</p>
            <button
              type="button"
              onClick={next}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800"
            >
              换一条建议 <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
