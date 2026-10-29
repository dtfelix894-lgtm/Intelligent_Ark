"use client";

import type { TrendPoint } from "./types";

type Props = {
  items: TrendPoint[] | null;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
};

export function RiskTrendChart({ items, loading, error, onRetry }: Props) {
  if (loading) {
    return <div className="h-44 animate-pulse rounded-2xl border border-border bg-white/70 motion-reduce:animate-none" aria-label="风险走势加载中" />;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p>{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">
            重试
          </button>
        ) : null}
      </div>
    );
  }
  const data = items || [];
  const max = Math.max(1, ...data.map((d) => d.yellow + d.red));
  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">近 7 日风险走势</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">黄码 / 红码条数（仅入池事件）</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-amber-400" />黄</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-red-500" />红</span>
        </div>
      </div>
      <div className="flex h-36 items-end gap-2">
        {data.map((d) => {
          const total = d.yellow + d.red;
          const h = Math.max(total > 0 ? 8 : 2, Math.round((total / max) * 120));
          const redH = total ? Math.round((d.red / total) * h) : 0;
          const yellowH = h - redH;
          return (
            <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex w-full max-w-[36px] flex-col justify-end overflow-hidden rounded-md bg-muted/40" style={{ height: 128 }} title={`${d.label}: 黄${d.yellow} 红${d.red}`}>
                <div className="mt-auto w-full bg-amber-400" style={{ height: yellowH }} />
                <div className="w-full bg-red-500" style={{ height: redH }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
