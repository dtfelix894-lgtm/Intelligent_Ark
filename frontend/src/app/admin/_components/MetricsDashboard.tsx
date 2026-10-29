"use client";

import type { ReactNode } from "react";
import { BarChart3, RefreshCw } from "lucide-react";

export type MetricsPayload = {
  trend: { date: string; label?: string; yellow: number; red: number; count: number }[];
  tags: { tag: string; count: number | string }[];
  status_counts: Record<string, number | string>;
  closure_counts: Record<string, number | string>;
  claim_duration: Record<string, { count: number; median_minutes: number | null; p90_minutes: number | null }>;
  overdue_count: number;
  open_count: number;
  false_positive_by_tag: {
    tag: string;
    closed_count: number | string;
    false_positive_count: number | string;
    false_positive_rate: number | null;
  }[];
  days: number;
  note?: string;
};

type Props = {
  data: MetricsPayload | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
};

const STATUS_CN: Record<string, string> = {
  pending: "待认领",
  claimed: "已认领",
  verifying: "核实中",
  intervening: "干预中",
  referred: "已转介",
  monitoring: "持续关注",
  closed: "已结案",
};

const CLOSURE_CN: Record<string, string> = {
  confirmed: "确认风险",
  false_positive: "误报",
  undetermined: "无法判断",
  legacy_unlabeled: "未标注",
  unknown: "未知",
};

function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

export function MetricsDashboard({ data, loading, error, onRetry }: Props) {
  return (
    <section aria-labelledby="metrics-title" className="mt-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="metrics-title" className="flex items-center gap-2 text-xl font-bold">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
            数据看板
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            匿名聚合：不含学生账号与消息原文。计数 &lt;5 显示为 &lt;5。
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-xs font-semibold disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新看板
        </button>
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
          <button type="button" className="ml-3 font-semibold underline" onClick={onRetry}>
            重试
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="看板加载中">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />
          ))}
        </div>
      ) : !data ? (
        <div className="ark-soft-card py-10 text-center text-sm text-muted-foreground">暂无看板数据</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cell label="在途事件" value={data.open_count} />
            <Cell label="当前超时未认领" value={data.overdue_count} />
            <Cell
              label="红码认领中位/P90（分）"
              value={`${data.claim_duration.red?.median_minutes ?? "—"} / ${data.claim_duration.red?.p90_minutes ?? "—"}`}
            />
            <Cell
              label="黄码认领中位/P90（分）"
              value={`${data.claim_duration.yellow?.median_minutes ?? "—"} / ${data.claim_duration.yellow?.p90_minutes ?? "—"}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold">近 {data.days} 日风险走势</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {(data.trend || []).map((row) => (
                  <li key={row.date} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{row.label || row.date}</span>
                    <span>
                      黄 {row.yellow} · 红 {row.red} · 计 {row.count}
                    </span>
                  </li>
                ))}
                {(data.trend || []).length === 0 ? <li className="text-muted-foreground">暂无走势</li> : null}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold">风险标签分布</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {(data.tags || []).map((row) => (
                  <li key={row.tag} className="flex items-center justify-between gap-2">
                    <span>{row.tag}</span>
                    <span className="font-semibold">{row.count}</span>
                  </li>
                ))}
                {(data.tags || []).length === 0 ? <li className="text-muted-foreground">暂无标签</li> : null}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold">各状态数量</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {Object.entries(data.status_counts || {}).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{STATUS_CN[k] || k}</span>
                    <span className="font-semibold">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold">结案标注分布</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {Object.entries(data.closure_counts || {}).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{CLOSURE_CN[k] || k}</span>
                    <span className="font-semibold">{v}</span>
                  </li>
                ))}
                {Object.keys(data.closure_counts || {}).length === 0 ? (
                  <li className="text-muted-foreground">暂无结案</li>
                ) : null}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold">按标签误报率（结案样本）</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {(data.false_positive_by_tag || []).map((row) => (
                <li key={row.tag} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{row.tag}</span>
                  <span className="text-muted-foreground">
                    结案 {row.closed_count} · 误报 {row.false_positive_count}
                    {row.false_positive_rate != null ? ` · ${(row.false_positive_rate * 100).toFixed(1)}%` : " · 样本不足"}
                  </span>
                </li>
              ))}
              {(data.false_positive_by_tag || []).length === 0 ? (
                <li className="text-muted-foreground">暂无结案样本</li>
              ) : null}
            </ul>
          </div>
          {data.note ? <p className="text-xs text-muted-foreground">{data.note}</p> : null}
        </div>
      )}
    </section>
  );
}