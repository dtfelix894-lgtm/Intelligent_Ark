"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { apiJson } from "@/lib/api";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { InterventionRow, StudentActivity, StudentRow } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function fmt(value?: string | null) {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function StudentRoster({ open, onOpenChange }: Props) {
  const [items, setItems] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activity, setActivity] = useState<StudentActivity | null>(null);
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{ items: StudentRow[] }>("/api/admin/users?scenario=university", { side: "b", cache: "no-store" });
      setItems(data.items || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学生列表加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadUsers();
  }, [open]);

  async function openDetail(userId: number) {
    setSelectedId(userId);
    setDetailLoading(true);
    setDetailError("");
    setActivity(null);
    setInterventions([]);
    try {
      const [act, ints] = await Promise.all([
        apiJson<StudentActivity>(`/api/admin/users/${userId}/activity?scenario=university`, { side: "b", cache: "no-store" }),
        apiJson<{ items: InterventionRow[] }>(`/api/admin/users/${userId}/interventions?scenario=university`, { side: "b", cache: "no-store" }),
      ]);
      setActivity(act);
      setInterventions(ints.items || []);
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : "详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  const selected = items.find((u) => u.id === selectedId) || null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ark-scrollbar flex w-[min(96vw,440px)] flex-col gap-0 overflow-y-auto p-0">
        <SheetHeader className="shrink-0 border-b border-border bg-white/90 px-5 pb-4 pt-5 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            学生一览
          </SheetTitle>
          <SheetDescription>轻量账号与风险计数；详情仅含脱敏摘要与跟进记录，不含聊天原文。</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{items.length} 名学生</p>
            <button type="button" onClick={loadUsers} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-secondary">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              刷新
            </button>
          </div>

          {error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {error}
            </div>
          ) : null}

          {loading && items.length === 0 ? (
            <div className="space-y-2" aria-label="学生列表加载中">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-muted/50 motion-reduce:animate-none" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">暂无学生账号</p>
          ) : (
            <ul className="space-y-2">
              {items.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => void openDetail(user.id)}
                    className={`ark-interactive flex w-full flex-col items-start rounded-xl border px-3 py-3 text-left ${
                      selectedId === user.id ? "border-primary bg-secondary/70" : "border-border bg-white hover:bg-muted/40"
                    }`}
                  >
                    <span className="text-sm font-semibold">{user.account}</span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {user.school || "未填学校"} · 学号 {user.student_id || "—"}
                    </span>
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      提问 {user.request_count} · 红 {user.red_count} · 黄 {user.yellow_count}
                      {user.last_active ? ` · 最近 ${fmt(user.last_active)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedId != null && (
            <section className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
              <h3 className="text-sm font-semibold text-violet-950">详情 · {selected?.account || selectedId}</h3>
              <p className="mt-1 text-[11px] leading-4 text-violet-900/80">不展示对话原文；干预记录仅含脱敏摘要。</p>
              {detailLoading ? (
                <div className="mt-3 h-24 animate-pulse rounded-xl bg-white/70 motion-reduce:animate-none" />
              ) : detailError ? (
                <p role="alert" className="mt-3 text-sm text-red-800">
                  {detailError}
                </p>
              ) : (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs font-semibold text-muted-foreground">活跃概览</p>
                    <p className="mt-1">提问次数 {activity?.request_count ?? 0}</p>
                    <p className="text-xs text-muted-foreground">首次 {fmt(activity?.first_active)} · 最近 {fmt(activity?.last_active)}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs font-semibold text-muted-foreground">已跟进干预（脱敏）</p>
                    {interventions.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">暂无已跟进记录</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {interventions.slice(0, 8).map((row) => (
                          <li key={row.id} className="rounded-lg border border-border/80 px-2.5 py-2 text-xs leading-5">
                            <span className="font-semibold">{row.level === "red" ? "红" : "黄"}</span>
                            <span className="text-muted-foreground"> · 分 {row.score} · {fmt(row.handled_at || row.created_at)}</span>
                            <p className="mt-1 text-foreground">{row.summary || "（无摘要）"}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
