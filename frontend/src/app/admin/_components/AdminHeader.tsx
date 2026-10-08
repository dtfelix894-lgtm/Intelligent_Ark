"use client";

import { GraduationCap } from "lucide-react";
import { UserSettings, type WarningSettings } from "@/components/UserSettings";

type Props = { school: string; worker: string; onLogout: () => void; busy: boolean; warningSettings: WarningSettings; onWarningSettingsChange: (settings: WarningSettings) => void; };

export function AdminHeader({ school, worker, onLogout, busy, warningSettings, onWarningSettingsChange }: Props) {
  return <header className="sticky top-0 z-30 border-b border-border/80 bg-white/90 backdrop-blur-xl"><div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"><div className="flex min-w-0 items-center gap-3"><span className="ark-icon-tile"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><p className="truncate font-bold">智伴方舟 · 高校工作台</p><p className="truncate text-xs text-muted-foreground">{school || "高校心理支持中心"}{worker ? ` · ${worker}` : ""}</p></div></div><UserSettings mode="admin" school={school} account={worker} onLogout={onLogout} logoutBusy={busy} warningSettings={warningSettings} onWarningSettingsChange={onWarningSettingsChange} /></div></header>;
}
