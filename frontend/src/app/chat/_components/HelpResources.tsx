"use client";

import { useEffect, useState } from "react";
import { Phone, RefreshCw, ShieldCheck, UserRoundCheck } from "lucide-react";
import { apiJson } from "@/lib/api";
import type { HelpResourcesConfig, HelpResourcePhone } from "./types";

function dialable(items: HelpResourcePhone[]) {
  return items.filter((item) => item.phone && item.phone.trim().length > 0);
}

export function HelpResources() {
  const [data, setData] = useState<HelpResourcesConfig | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      setData(await apiJson<HelpResourcesConfig>("/api/help-resources", { side: "c" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "求助资源暂时无法加载");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (!data && !error) {
    return (
      <div className="space-y-3" aria-label="求助资源加载中">
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-white/70 motion-reduce:animate-none" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
          <p role="alert" className="text-sm leading-6 text-red-900">
            {error}
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const phones = dialable([
    ...(data?.psych_center ? [data.psych_center] : []),
    ...((data?.hotlines as HelpResourcePhone[] | undefined) || []),
  ]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
        <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        <h3 className="mt-3 font-semibold text-emerald-950">需要现实中的帮助？</h3>
        <p className="mt-2 text-sm leading-6 text-emerald-900">
          请联系辅导员、学校心理中心，或身边可信任的同学和老师。
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center gap-2">
          <UserRoundCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">专业支持</h3>
        </div>
        <div className="mt-3 space-y-2">
          {phones.length > 0 ? (
            phones.map((item) => (
              <a
                key={`${item.label}-${item.phone}`}
                href={`tel:${item.phone}`}
                className="ark-interactive flex min-h-14 items-center justify-between rounded-xl border border-border px-3 hover:bg-muted"
              >
                <span>
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.phone}</span>
                </span>
                <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
              </a>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm leading-6 text-muted-foreground">
              请联系学校心理中心获取本地求助电话。
              {data?.missing_hint ? <span className="mt-2 block text-xs text-amber-800">{data.missing_hint}</span> : null}
            </p>
          )}
          {data?.appointment?.url ? (
            <a
              href={data.appointment.url}
              target="_blank"
              rel="noreferrer"
              className="ark-interactive flex min-h-14 items-center justify-between rounded-xl border border-border px-3 hover:bg-muted"
            >
              <span>
                <span className="block text-sm font-semibold">{data.appointment.label || "预约心理咨询"}</span>
                <span className="block text-xs text-muted-foreground">打开预约入口</span>
              </span>
            </a>
          ) : null}
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        如果你或他人正处于紧急危险中，请立即联系当地紧急服务和现实中的专业人员。
      </p>
    </div>
  );
}
