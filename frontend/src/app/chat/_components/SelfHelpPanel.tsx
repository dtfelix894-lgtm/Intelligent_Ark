"use client";

import { useMemo, useState } from "react";
import { ClipboardList, HeartHandshake, Leaf, ShieldCheck, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AudioWellness } from "./AudioWellness";
import { StressReliefTips } from "./StressReliefTips";
import { ReleaseTools } from "./ReleaseTools";
import { HelpResources } from "./HelpResources";
import { SelfAssessPanel } from "./SelfAssessPanel";
import { buildToolRecommendations, type ToolFocus, type ToolRecommendation } from "./contextRecommendations";
import type { ChatMessage } from "./types";

type Props = {
  instanceId?: string;
  tab?: string;
  onTabChange?: (value: string) => void;
  defaultTab?: string;
  messages?: ChatMessage[];
  onOpenHelp?: () => void;
};

export function SelfHelpPanel({
  instanceId = "self-help",
  tab,
  onTabChange,
  defaultTab = "relax",
  messages = [],
  onOpenHelp,
}: Props) {
  const controlled = tab !== undefined;
  const recommendations = useMemo(() => buildToolRecommendations(messages), [messages]);
  const [focus, setFocus] = useState<ToolFocus | null>(null);
  const [tipsOpenToken, setTipsOpenToken] = useState(0);

  function applyRecommendation(item: ToolRecommendation) {
    setFocus(item.focus);
    onTabChange?.(item.tab);
    if (item.focus === "tips") setTipsOpenToken((n) => n + 1);
  }

  return (
    <div>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Self care</p>
        <h2 className="mt-1 text-lg font-bold">自助工具</h2>
        <p className="mt-1 text-sm text-muted-foreground">先照顾此刻的自己。</p>
      </div>

      {recommendations.length > 0 && (
        <section className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/90 p-3" aria-label="情境推荐">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-700" aria-hidden="true" />
            <p className="text-sm font-semibold text-amber-950">此刻更适合</p>
          </div>
          <div className="space-y-2">
            {recommendations.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyRecommendation(item)}
                className="ark-interactive flex w-full flex-col items-start rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-left hover:bg-amber-50 active:scale-[0.99]"
              >
                <span className="text-sm font-semibold text-amber-950">{item.title}</span>
                <span className="mt-0.5 text-xs leading-5 text-amber-900/90">{item.reason}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <Tabs
        value={controlled ? tab : undefined}
        defaultValue={controlled ? undefined : defaultTab}
        onValueChange={onTabChange}
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-4">
          <TabsTrigger value="relax" className="min-h-10 rounded-lg gap-1 px-2 text-xs sm:text-sm">
            <Leaf className="h-4 w-4" aria-hidden="true" />
            放松
          </TabsTrigger>
          <TabsTrigger value="release" className="min-h-10 rounded-lg gap-1 px-2 text-xs sm:text-sm">
            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
            释放
          </TabsTrigger>
          <TabsTrigger value="assess" className="min-h-10 rounded-lg gap-1 px-2 text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            自测
          </TabsTrigger>
          <TabsTrigger value="help" className="min-h-10 rounded-lg gap-1 px-2 text-xs sm:text-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            帮助
          </TabsTrigger>
        </TabsList>
        <TabsContent value="relax" className="mt-5 space-y-5">
          <AudioWellness
            idPrefix={instanceId}
            preferredMood={focus === "sleep" ? "sleep" : focus === "breathe" ? "relax" : undefined}
            highlightBreathing={focus === "breathe" || focus === "sleep"}
          />
          <StressReliefTips autoOpenToken={tipsOpenToken} highlighted={focus === "tips"} />
        </TabsContent>
        <TabsContent value="release" className="mt-5 space-y-5">
          <ReleaseTools prefer={focus === "shredder" ? "shredder" : focus === "typing" ? "typing" : null} />
        </TabsContent>
        <TabsContent value="assess" className="mt-5 space-y-5">
          <SelfAssessPanel onOpenHelp={onOpenHelp} />
        </TabsContent>
        <TabsContent value="help" className="mt-5">
          <HelpResources />
        </TabsContent>
      </Tabs>
    </div>
  );
}
