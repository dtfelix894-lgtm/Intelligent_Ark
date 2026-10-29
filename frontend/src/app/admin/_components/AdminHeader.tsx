"use client";

import { AlarmClock, GraduationCap, RefreshCw, Users } from "lucide-react";
import { UserSettings, type WarningSettings } from "@/components/UserSettings";

type Props = {
  school: string;
  worker: string;
  onLogout: () => void;
  busy: boolean;
  warningSettings: WarningSettings;
  onWarningSettingsChange: (settings: WarningSettings) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onOpenStudents: () => void;
  overdueCount?: number;
};

export function AdminHeader({
  school,
  worker,
  onLogout,
  busy,
  warningSettings,
  onWarningSettingsChange,
  onRefresh,
  refreshing,
  onOpenStudents,
  overdueCount = 0,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="ark-icon-tile">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold tracking-tight">智伴方舟 · 高校工作台</p>
            <p className="truncate text-xs text-muted-foreground">
              {school || "心理支持中心"}
              {worker ? ` · ${worker}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {overdueCount > 0 ? (
            <span
              role="status"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-red-600 px-3 text-xs font-bold text-white"
              title="超时未认领事件数"
            >
              <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" />
              超时 {overdueCount}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onOpenStudents}
            className="ark-interactive inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Users className="h-5 w-5" aria-hidden="true" />
            <span className="hidden sm:inline">学生一览</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="ark-interactive inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            <span className="hidden sm:inline">{refreshing ? "刷新中" : "刷新"}</span>
          </button>
          <UserSettings
            mode="admin"
            school={school}
            account={worker}
            onLogout={onLogout}
            logoutBusy={busy}
            warningSettings={warningSettings}
            onWarningSettingsChange={onWarningSettingsChange}
          />
        </div>
      </div>
    </header>
  );
}
