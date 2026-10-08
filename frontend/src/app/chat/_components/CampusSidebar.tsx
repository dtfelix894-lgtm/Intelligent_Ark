"use client";

import { useEffect, useState } from "react";
import { Quote, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api";
import type { CampusContext } from "./types";

export function CampusSidebar() {
  const [data, setData] = useState<CampusContext | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      setData(await apiJson<CampusContext>("/api/scenario/context?scenario=university", { side: "c" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "校园信息暂时无法加载");
    }
  }

  useEffect(() => { void load(); }, []);

  if (!data && !error) {
    return <div className="space-y-4" aria-label="每日治愈加载中"><div className="h-44 animate-pulse rounded-2xl border border-border bg-white/70 motion-reduce:animate-none" /></div>;
  }

  if (error) {
    return <div className="ark-soft-card p-5"><p role="alert" className="text-sm leading-6 text-red-800">{error}</p><button type="button" onClick={load} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-secondary"><RefreshCw className="h-4 w-4" aria-hidden="true" />重新加载</button></div>;
  }

  return (
    <div className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Campus today</p><h2 className="mt-1 text-lg font-bold">校园状态</h2></div>
      <article className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-emerald-950"><Quote className="h-5 w-5 text-emerald-700" aria-hidden="true" /><h3 className="mt-3 text-sm font-semibold">每日治愈</h3><blockquote className="mt-3 text-base leading-8">“{data?.daily_quote || "允许一切发生，先照顾好自己。"}”</blockquote>{data?.daily_quote_source && <p className="mt-4 border-t border-emerald-200 pt-3 text-xs text-emerald-800">来源：{data.daily_quote_source}</p>}</article>
    </div>
  );
}
