"use client";

import type { TagCount } from "./types";

type Props = {
  items: TagCount[] | null;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
};

export function RiskTagsChart({ items, loading, error, onRetry }: Props) {
  if (loading) {
    return <div className="h-44 animate-pulse rounded-2xl border border-border bg-white/70 motion-reduce:animate-none" aria-label="风险标签加载中" />;
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
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">高频风险标签</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">脱敏标签频次 Top</p>
      {data.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">暂无标签数据</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {data.map((item) => (
            <li key={item.tag} className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2">
              <div>
                <div className="mb-1 flex justify-between gap-2 text-xs">
                  <span className="truncate font-semibold">{item.tag}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
                </div>
              </div>
              <span className="text-right text-xs font-semibold tabular-nums text-muted-foreground">{item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
