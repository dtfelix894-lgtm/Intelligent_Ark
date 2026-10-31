"use client";

import { useMemo } from "react";
import { CheckCircle2, Inbox, LayoutList, RefreshCw, Users } from "lucide-react";
import { RiskAlertCard } from "./RiskAlertCard";
import type { HandledFilter, LevelFilter, RiskAlert, ViewMode } from "./types";
import { formatAlertTime } from "./types";

type Props = {
  alerts: RiskAlert[];
  alertsLoaded: boolean;
  alertsLoading: boolean;
  levelFilter: LevelFilter;
  handledFilter: HandledFilter;
  viewMode: ViewMode;
  onLevelFilter: (v: LevelFilter) => void;
  onHandledFilter: (v: HandledFilter) => void;
  onViewMode: (v: ViewMode) => void;
  handlingId: number | null;
  claimingId: number | null;
  onHandle: (id: number) => void;
  onClaim: (id: number) => void;
  onOpenDetail: (id: number) => void;
  currentWorker: string;
  error: string;
  notice: string;
  onRetry: () => void;
  prioritizeHighRisk: boolean;
};

type StudentGroup = {
  key: string;
  account: string;
  userId?: number;
  events: RiskAlert[];
  count: number;
  highest: "red" | "yellow";
  earliestUnclaimed: string | null;
};

function parseTime(value: string) {
  const normalized = value && !value.includes("T") ? value.replace(" ", "T") : value;
  const t = new Date(normalized).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function buildGroups(alerts: RiskAlert[]): StudentGroup[] {
  const map = new Map<string, StudentGroup>();
  for (const alert of alerts) {
    const key = alert.user_id != null ? `u:${alert.user_id}` : `a:${alert.account}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        account: alert.account,
        userId: alert.user_id,
        events: [],
        count: 0,
        highest: alert.level === "red" ? "red" : "yellow",
        earliestUnclaimed: null,
      };
      map.set(key, group);
    }
    group.events.push(alert);
    group.count += 1;
    if (alert.level === "red") group.highest = "red";
    if (!alert.assignee && !alert.handled) {
      if (!group.earliestUnclaimed || parseTime(alert.created_at) < parseTime(group.earliestUnclaimed)) {
        group.earliestUnclaimed = alert.created_at;
      }
    }
  }
  const groups = Array.from(map.values());
  for (const group of groups) {
    group.events.sort((left, right) => parseTime(right.created_at) - parseTime(left.created_at));
  }
  // 组序：按组内最新事件时间新→旧
  return groups.sort((a, b) => {
    const aLatest = Math.max(...a.events.map((e) => parseTime(e.created_at)), 0);
    const bLatest = Math.max(...b.events.map((e) => parseTime(e.created_at)), 0);
    return bLatest - aLatest;
  });
}

export function AlertPool({
  alerts,
  alertsLoaded,
  alertsLoading,
  levelFilter,
  handledFilter,
  viewMode,
  onLevelFilter,
  onHandledFilter,
  onViewMode,
  handlingId,
  claimingId,
  onHandle,
  onClaim,
  onOpenDetail,
  currentWorker,
  error,
  notice,
  onRetry,
  prioritizeHighRisk,
}: Props) {
  const groups = useMemo(() => (viewMode === "byStudent" ? buildGroups(alerts) : []), [alerts, viewMode]);

  return (
    <section aria-labelledby="alerts-title" className="mt-8">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="alerts-title" className="text-xl font-bold">
            风险预警池
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            仅记录黄色、红色风险；绿色正常对话不会进入预警池。列表展示脱敏摘要，不含学生消息原文。
          </p>
        </div>
        <span role="status" aria-atomic="true" className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
          当前 {alerts.length} 条
          {prioritizeHighRisk && handledFilter === "pending" ? " · 红色优先" : " · 按时间"}
          {viewMode === "byStudent" ? ` · ${groups.length} 名学生` : ""}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-white p-1">
          {(
            [
              ["all", "全部等级"],
              ["red", "仅红色"],
              ["yellow", "仅黄色"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={levelFilter === value}
              onClick={() => onLevelFilter(value)}
              className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${
                levelFilter === value ? "bg-violet-700 text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-white p-1">
          {(
            [
              ["pending", "待跟进(未结案)"],
              ["done", "已结案"],
              ["all", "全部状态"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={handledFilter === value}
              onClick={() => onHandledFilter(value)}
              className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${
                handledFilter === value ? "bg-emerald-700 text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-white p-1">
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            onClick={() => onViewMode("list")}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
              viewMode === "list" ? "bg-slate-800 text-white" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" aria-hidden="true" />
            列表
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "byStudent"}
            onClick={() => onViewMode("byStudent")}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
              viewMode === "byStudent" ? "bg-slate-800 text-white" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            按学生分组
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 font-semibold hover:bg-red-100">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            重试
          </button>
        </div>
      )}

      {alertsLoading ? (
        <div className="space-y-3" aria-label="预警列表加载中">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-2xl border border-border bg-white/70 motion-reduce:animate-none" />
          ))}
        </div>
      ) : !alertsLoaded ? (
        <div className="ark-soft-card py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-700">
            <RefreshCw className="h-7 w-7" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-lg font-semibold">预警数据暂不可用</h3>
          <p className="mt-2 text-sm text-muted-foreground">暂时无法加载预警列表，请检查网络后点击重试。</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="ark-soft-card py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Inbox className="h-7 w-7" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-lg font-semibold">当前没有符合筛选的预警</h3>
          <p className="mt-2 text-sm text-muted-foreground">新的黄/红风险信号出现后会自动进入这里。</p>
        </div>
      ) : viewMode === "byStudent" ? (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key} className="rounded-2xl border border-border bg-slate-50/80 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">学生账号 {group.account}</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {group.count} 条事件
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    group.highest === "red" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"
                  }`}
                >
                  最高 {group.highest === "red" ? "红色" : "黄色"}
                </span>
                {group.earliestUnclaimed ? (
                  <span className="text-xs text-muted-foreground">
                    最早未认领 {formatAlertTime(group.earliestUnclaimed)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">组内均已认领或已跟进</span>
                )}
              </div>
              <div className="space-y-3">
                {group.events.map((alert) => (
                  <RiskAlertCard
                    key={alert.id}
                    alert={alert}
                    handling={handlingId === alert.id}
                    claiming={claimingId === alert.id}
                    onHandle={onHandle}
                    onClaim={onClaim}
                    onOpenDetail={onOpenDetail}
                    currentWorker={currentWorker}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <RiskAlertCard
              key={alert.id}
              alert={alert}
              handling={handlingId === alert.id}
              claiming={claimingId === alert.id}
              onHandle={onHandle}
              onClaim={onClaim}
              onOpenDetail={onOpenDetail}
              currentWorker={currentWorker}
            />
          ))}
        </div>
      )}
    </section>
  );
}
