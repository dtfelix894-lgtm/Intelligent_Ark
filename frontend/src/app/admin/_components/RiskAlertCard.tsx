"use client";

import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";

export type RiskAlert = { id: number; account: string; level: string; score: number; tags: string[]; summary: string; created_at: string; };

type Props = { alert: RiskAlert; handling: boolean; onHandle: (id: number) => void; };

function dateTime(value: string) {
  const normalized = value && !value.includes("T") ? value.replace(" ", "T") : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function RiskAlertCard({ alert, handling, onHandle }: Props) {
  const red = alert.level === "red";
  return <article className={`rounded-2xl border bg-white p-5 shadow-sm ${red ? "border-red-200" : "border-amber-200"}`}><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${red ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{red ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}{red ? "高风险" : "需关注"}</span><span className="text-sm font-semibold">学生 {alert.account}</span><span className="text-sm text-muted-foreground">风险分数 {alert.score}</span><time className="text-xs text-muted-foreground" dateTime={alert.created_at}>{dateTime(alert.created_at)}</time></div><p className="mt-4 leading-7 text-foreground">{alert.summary || "该学生的对话出现了值得关注的风险信号。"}</p>{alert.tags?.length > 0 && <ul aria-label="风险标签" className="mt-3 flex flex-wrap gap-2">{alert.tags.map((tag) => <li key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{tag}</li>)}</ul>}</div><button type="button" onClick={() => onHandle(alert.id)} disabled={handling} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto">{handling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}{handling ? "保存中…" : "标记已跟进"}</button></div></article>;
}
