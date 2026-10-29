"use client";

import { AlertTriangle, CheckCircle2, Eye, Hand, Loader2, ShieldAlert, UserCheck } from "lucide-react";
import type { RiskAlert } from "./types";
import { CLOSURE_LABELS, alertStatusLabel, formatAlertTime, resolveStatus } from "./types";

type Props = {
  alert: RiskAlert;
  handling: boolean;
  claiming?: boolean;
  onHandle?: (id: number) => void;
  onClaim?: (id: number) => void;
  onOpenDetail?: (id: number) => void;
  currentWorker?: string;
};

export function RiskAlertCard({
  alert,
  handling,
  claiming,
  onHandle,
  onClaim,
  onOpenDetail,
  currentWorker,
}: Props) {
  const red = alert.level === "red";
  const statusKey = resolveStatus(alert);
  const closed = statusKey === "closed";
  const claimed = Boolean(alert.assignee) && statusKey !== "pending";
  const status = alertStatusLabel(alert);
  const mine = Boolean(alert.assignee && currentWorker && alert.assignee === currentWorker);

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        alert.is_overdue ? "border-red-500 ring-2 ring-red-100" : closed ? "border-border opacity-95" : red ? "border-red-200" : "border-amber-200"
      }`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${
                red ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"
              }`}
            >
              {red ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              {red ? "红色 · 高风险" : "黄色 · 需关注"}
            </span>
            <span
              className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${
                closed
                  ? "bg-emerald-50 text-emerald-800"
                  : statusKey === "pending"
                    ? "bg-violet-50 text-violet-800"
                    : "bg-sky-50 text-sky-900"
              }`}
            >
              {status}
            </span>
            {alert.closure_label ? (
              <span className="inline-flex min-h-7 items-center rounded-full bg-slate-100 px-2.5 text-xs font-semibold text-slate-800">
                {CLOSURE_LABELS[alert.closure_label] || alert.closure_label}
              </span>
            ) : null}
            {alert.is_overdue ? (
              <span className="inline-flex min-h-7 items-center rounded-full bg-red-600 px-2.5 text-xs font-bold text-white">
                已超时{typeof alert.overdue_minutes === "number" && alert.overdue_minutes > 0 ? ` ${alert.overdue_minutes} 分` : ""}
              </span>
            ) : null}
            <span className="text-sm font-semibold">学生账号 {alert.account}</span>
            <span className="text-sm text-muted-foreground">风险分数 {alert.score}</span>
            <time className="text-xs text-muted-foreground" dateTime={alert.created_at}>
              {formatAlertTime(alert.created_at)}
            </time>
          </div>

          {alert.claim_due_at && statusKey === "pending" && !alert.assignee ? (
            <p className="mt-2 text-xs text-muted-foreground">
              认领截止 {formatAlertTime(alert.claim_due_at)}
              {alert.is_overdue ? " · 已超时置顶" : ""}
            </p>
          ) : null}
          {alert.assignee ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-sky-900">
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
              负责人 {alert.assignee}
              {mine ? "（我）" : ""}
              {alert.claimed_at ? ` · 认领于 ${formatAlertTime(alert.claimed_at)}` : ""}
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">尚未认领</p>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">脱敏摘要</p>
          <p className="mt-1 leading-7 text-foreground">
            {alert.summary || "该学生的对话出现了值得关注的风险信号。"}
          </p>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">工作台不展示学生消息原文（ADR 0002）。</p>
          {alert.tags?.length > 0 && (
            <ul aria-label="风险标签" className="mt-3 flex flex-wrap gap-2">
              {alert.tags.map((tag) => (
                <li key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {tag}
                </li>
              ))}
            </ul>
          )}
          {closed && (alert.handled_by || alert.handled_at || alert.closure_label) ? (
            <p className="mt-3 text-xs text-muted-foreground">
              跟进人 {alert.handled_by || "—"}
              {alert.handled_at ? ` · ${formatAlertTime(alert.handled_at)}` : ""}
              {alert.note ? ` · ${alert.note}` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-40">
          {onOpenDetail ? (
            <button
              type="button"
              onClick={() => onOpenDetail(alert.id)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              查看详情
            </button>
          ) : null}
          {!closed && statusKey === "pending" && onClaim ? (
            <button
              type="button"
              onClick={() => onClaim(alert.id)}
              disabled={claiming}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claiming ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Hand className="h-4 w-4" aria-hidden="true" />}
              {claiming ? "认领中…" : "认领"}
            </button>
          ) : null}
          {!closed && onHandle ? (
            <button
              type="button"
              onClick={() => onHandle(alert.id)}
              disabled={handling}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {handling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              {handling ? "保存中…" : "标记已跟进"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export type { RiskAlert };
