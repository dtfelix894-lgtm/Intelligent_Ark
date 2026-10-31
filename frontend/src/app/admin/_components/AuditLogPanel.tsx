"use client";

import { useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { formatAlertTime } from "./types";

export type AuditLogRow = {
  id: number;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  meta: Record<string, unknown>;
  created_at: string;
};

type Props = {
  items: AuditLogRow[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onFilter: (actor: string, action: string) => void;
};

const TARGET_CN: Record<string, string> = {
  risk_event: "预警",
  user: "账号",
};

const ACTION_CN: Record<string, string> = {
  view_alert: "查看详情",
  claim_alert: "认领",
  assign_alert: "分派/改派",
  transition_alert: "状态流转",
  add_follow_up_record: "新增跟进记录",
  complete_reassessment: "完成复评",
  create_reassessment: "创建复评",
  escalate_overdue: "超时升级",
  view_audit_logs: "查看操作记录",
};

export function AuditLogPanel({ items, loading, error, onRetry, onFilter }: Props) {
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");

  return (
    <section aria-labelledby="audit-title" className="mt-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="audit-title" className="flex items-center gap-2 text-xl font-bold">
            <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
            操作记录
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            记录谁在何时对哪条预警做了哪些操作；不含学生聊天原文。
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-xs font-semibold disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="按工号筛选"
          className="min-h-10 rounded-xl border border-border px-3 text-sm"
        />
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="按操作类型筛选"
          className="min-h-10 min-w-[12rem] rounded-xl border border-border px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => onFilter(actor.trim(), action.trim())}
          className="min-h-10 rounded-xl bg-slate-800 px-4 text-xs font-semibold text-white"
        >
          应用筛选
        </button>
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="space-y-2" aria-label="操作记录加载中">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-14 animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="ark-soft-card py-10 text-center text-sm text-muted-foreground">暂无操作记录</div>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-white px-4 py-3 text-sm shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <time className="text-muted-foreground" dateTime={row.created_at}>
                  {formatAlertTime(row.created_at)}
                </time>
                <span className="font-semibold">{row.actor}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
                  {ACTION_CN[row.action] || row.action}
                </span>
                <span className="text-muted-foreground">
                  {TARGET_CN[row.target_type] || "相关对象"} #{row.target_id}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}