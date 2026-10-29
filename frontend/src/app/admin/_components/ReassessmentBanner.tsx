"use client";

import { CalendarClock, Loader2 } from "lucide-react";
import type { Reassessment } from "./types";
import { formatAlertDate } from "./types";

type Props = {
  todayCount: number;
  overdueCount: number;
  items: Reassessment[];
  loading: boolean;
  onOpenEvent: (eventId: number) => void;
  onRefresh: () => void;
};

export function ReassessmentBanner({
  todayCount,
  overdueCount,
  items,
  loading,
  onOpenEvent,
  onRefresh,
}: Props) {
  if (!loading && todayCount === 0 && overdueCount === 0 && items.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="reassess-title"
      className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-900">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="reassess-title" className="text-sm font-bold text-amber-950">
              复评提醒（站内）
            </h2>
            <p className="mt-1 text-xs leading-5 text-amber-900/80">
              今日到期 {todayCount} · 已逾期 {overdueCount}。完成时请选择「好转」或「仍有风险」。
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-950"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          刷新复评
        </button>
      </div>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.slice(0, 8).map((ra) => (
            <li key={ra.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-white px-3 py-2 text-xs">
              <div className="min-w-0">
                <span className="font-semibold">学生 {ra.student_account || "—"}</span>
                <span className="text-muted-foreground"> · 事件 #{ra.event_id}</span>
                <span className="text-muted-foreground"> · 到期 {formatAlertDate(ra.due_date)}</span>
                {ra.assignee ? <span className="text-muted-foreground"> · 负责人 {ra.assignee}</span> : null}
              </div>
              <button
                type="button"
                onClick={() => onOpenEvent(ra.event_id)}
                className="min-h-8 rounded-lg bg-amber-800 px-3 font-semibold text-white"
              >
                去处理
              </button>
            </li>
          ))}
        </ul>
      ) : loading ? (
        <p className="mt-3 text-xs text-amber-900/70">加载复评中…</p>
      ) : null}
    </section>
  );
}