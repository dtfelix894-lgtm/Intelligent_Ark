"use client";

import { HeartHandshake, Leaf, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AudioWellness } from "./AudioWellness";
import { StressReliefTips } from "./StressReliefTips";
import { ReleaseTools } from "./ReleaseTools";
import { HelpResources } from "./HelpResources";

export function SelfHelpPanel({ instanceId = "self-help" }: { instanceId?: string }) {
  return <div><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Self care</p><h2 className="mt-1 text-lg font-bold">自助工具</h2><p className="mt-1 text-sm text-muted-foreground">先照顾此刻的自己。</p></div><Tabs defaultValue="relax"><TabsList className="grid h-12 w-full grid-cols-3 rounded-xl bg-muted p-1"><TabsTrigger value="relax" className="min-h-10 rounded-lg gap-1 px-2"><Leaf className="h-4 w-4" aria-hidden="true" />放松</TabsTrigger><TabsTrigger value="release" className="min-h-10 rounded-lg gap-1 px-2"><HeartHandshake className="h-4 w-4" aria-hidden="true" />释放</TabsTrigger><TabsTrigger value="help" className="min-h-10 rounded-lg gap-1 px-2"><ShieldCheck className="h-4 w-4" aria-hidden="true" />帮助</TabsTrigger></TabsList><TabsContent value="relax" className="mt-5 space-y-5"><AudioWellness idPrefix={instanceId} /><StressReliefTips /></TabsContent><TabsContent value="release" className="mt-5 space-y-5"><StressReliefTips /><ReleaseTools /></TabsContent><TabsContent value="help" className="mt-5"><HelpResources /></TabsContent></Tabs></div>;
}
