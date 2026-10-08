"use client";

import { GraduationCap, Info, Leaf } from "lucide-react";
import { UserSettings } from "@/components/UserSettings";
import { companionName } from "@/lib/campus-companion";
import type { CompanionPersona } from "./types";

type Props = {
  onOpenCampus: () => void;
  onOpenTools: () => void;
  onLogout: () => void;
  busy?: boolean;
  school?: string;
  account?: string;
  studentId?: string;
  persona: CompanionPersona;
  onPersonaChange: (persona: CompanionPersona) => void;
};

export function ChatHeader({ onOpenCampus, onOpenTools, onLogout, busy, school, account, studentId, persona, onPersonaChange }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="ark-icon-tile"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0"><p className="truncate font-bold tracking-tight">智伴方舟</p><p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-600" />{companionName(persona)}在线</p></div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button type="button" onClick={onOpenCampus} className="ark-interactive inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden" aria-label="打开校园信息"><Info className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">校园信息</span></button>
          <button type="button" onClick={onOpenTools} className="ark-interactive inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground xl:hidden" aria-label="打开自助工具"><Leaf className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">自助工具</span></button>
          <UserSettings mode="student" school={school} account={account} studentId={studentId} onLogout={onLogout} logoutBusy={busy} companionPersona={persona} onCompanionPersonaChange={onPersonaChange} />
        </div>
      </div>
    </header>
  );
}
