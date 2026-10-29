"use client";

import { Settings2 } from "lucide-react";

export type ConfigSummary = {
  claim_timeouts: { red_minutes: number; yellow_minutes: number; app_env: string };
  reassess_interval_days: number[];
  psych_center: { label: string; phone?: string | null };
  hotline: { label: string; phone?: string | null };
  appointment: { label: string; url?: string | null };
  is_placeholder: boolean;
  editable: boolean;
};

type Props = {
  data: ConfigSummary | null;
  loading: boolean;
};

export function ConfigSummaryCard({ data, loading }: Props) {
  return (
    <section aria-labelledby="config-summary-title" className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-700 shadow-sm">
          <Settings2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="config-summary-title" className="text-sm font-bold">
            配置摘要（只读）
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">来自环境变量；本页只读。号码与时限请由学校心理中心维护。</p>
          {loading && !data ? (
            <p className="mt-3 text-sm text-muted-foreground">加载配置中…</p>
          ) : !data ? (
            <p className="mt-3 text-sm text-muted-foreground">配置暂不可用</p>
          ) : (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">红色认领时限</dt>
                <dd className="font-semibold">{data.claim_timeouts.red_minutes} 分钟</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">黄色认领时限</dt>
                <dd className="font-semibold">{data.claim_timeouts.yellow_minutes} 分钟</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">复评间隔（天）</dt>
                <dd className="font-semibold">{(data.reassess_interval_days || []).join(" / ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{data.psych_center.label}</dt>
                <dd className="font-semibold">{data.psych_center.phone || "未配置"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{data.hotline.label}</dt>
                <dd className="font-semibold">{data.hotline.phone || "未配置"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{data.appointment.label}</dt>
                <dd className="truncate font-semibold">{data.appointment.url || "未配置"}</dd>
              </div>
            </dl>
          )}

        </div>
      </div>
    </section>
  );
}