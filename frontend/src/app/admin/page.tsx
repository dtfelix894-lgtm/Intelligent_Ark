"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Inbox, RefreshCw, ShieldCheck } from "lucide-react";
import { apiJson, logout as logoutSession } from "@/lib/api";
import { AdminHeader } from "./_components/AdminHeader";
import { RiskAlertCard, type RiskAlert } from "./_components/RiskAlertCard";
import { StatsCards } from "./_components/StatsCards";
import { DEFAULT_WARNING_SETTINGS, type WarningSettings } from "@/components/UserSettings";

export default function AdminPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [handlingId, setHandlingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [school, setSchool] = useState("");
  const [worker, setWorker] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [warningSettings, setWarningSettings] = useState<WarningSettings>(DEFAULT_WARNING_SETTINGS);
  const loadSequence = useRef(0);
  const activeLoad = useRef<AbortController | null>(null);

  const load = useCallback(async (mode: "initial" | "manual" | "poll" = "initial") => {
    if (mode === "poll" && activeLoad.current) return;
    const sequence = ++loadSequence.current;
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10000);

    if (mode === "initial") {
      setAlertsLoading(true);
      setStatsLoading(true);
    } else if (mode === "manual") {
      setRefreshing(true);
    }

    try {
      const [alertsResult, statsResult] = await Promise.allSettled([
        apiJson<{ items: RiskAlert[] }>(`/api/admin/alerts?scenario=university&handled=false&_refresh=${Date.now()}`, { side: "b", cache: "no-store", signal: controller.signal }),
        apiJson<{ total_users: number }>(`/api/admin/stats?scenario=university&_refresh=${Date.now()}`, { side: "b", cache: "no-store", signal: controller.signal }),
      ]);
      if (sequence !== loadSequence.current) return;

      const failures: string[] = [];
      if (alertsResult.status === "fulfilled") {
        setAlerts(alertsResult.value.items || []);
        setAlertsLoaded(true);
      } else {
        failures.push("预警列表加载失败");
      }
      if (statsResult.status === "fulfilled") {
        setTotalUsers(statsResult.value.total_users ?? 0);
      } else {
        failures.push("学生账号统计加载失败");
      }
      setError(failures.length ? `${failures.join("；")}。请确认后端服务已启动后重试。` : "");
    } finally {
      window.clearTimeout(timeout);
      if (sequence === loadSequence.current) {
        activeLoad.current = null;
        setAlertsLoading(false);
        setStatsLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    // Identity comes only from the authenticated API, never a prior user's cache.
    void apiJson<{ account: string; school_name?: string }>("/api/auth/b-me", { side: "b" }).then((profile) => {
      setWorker(profile.account || "");
      setSchool(profile.school_name || "");
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load("poll"); }, warningSettings.refreshMs);
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void load("poll"); };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      activeLoad.current?.abort();
    };
  }, [load, warningSettings.refreshMs]);

  const orderedAlerts = useMemo(() => {
    if (!warningSettings.prioritizeHighRisk) return alerts;
    return [...alerts].sort((left, right) => {
      const riskDifference = (right.level === "red" ? 1 : 0) - (left.level === "red" ? 1 : 0);
      if (riskDifference !== 0) return riskDifference;
      return new Date(right.created_at.replace(" ", "T")).getTime() - new Date(left.created_at.replace(" ", "T")).getTime();
    });
  }, [alerts, warningSettings.prioritizeHighRisk]);

  async function handle(id: number) {
    setHandlingId(id);
    setError("");
    setNotice("");
    try {
      await apiJson(`/api/admin/alerts/${id}/handle`, { method: "POST", side: "b", body: { action: "follow_up", note: "已由高校工作端跟进" } });
      // 先从当前视图移除，避免用户在刷新完成前重复点击同一条预警。
      setAlerts((current) => current.filter((alert) => alert.id !== id));
      setNotice("跟进状态已保存。");
      await load("poll");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "跟进保存失败，请重试");
    } finally {
      setHandlingId(null);
    }
  }

  async function logout() {
    setLogoutBusy(true);
    try {
      await logoutSession("b");
      try {
        localStorage.removeItem("ark_admin_school");
        localStorage.removeItem("ark_admin_worker");
      } catch { /* Storage restrictions must not block logout. */ }
      router.replace("/admin-login");
    } catch {
      setError("退出失败，请重试");
      setLogoutBusy(false);
    }
  }

  return <main id="main-content" className="ark-grid-bg min-h-screen"><AdminHeader school={school} worker={worker} onLogout={logout} busy={logoutBusy} warningSettings={warningSettings} onWarningSettingsChange={setWarningSettings} /><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-primary">高校场景 · 实时工作台</p><h1 className="mt-2 text-3xl font-bold tracking-tight">学生心理风险管理</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">查看脱敏风险摘要并按学校流程跟进。页面约每 {warningSettings.refreshMs / 1000} 秒静默刷新一次。</p></div><button type="button" onClick={() => load("manual")} disabled={refreshing || alertsLoading || statsLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-secondary disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />{refreshing ? "刷新中…" : "立即刷新"}</button></div><StatsCards totalUsers={totalUsers} pendingAlerts={alertsLoaded ? alerts.length : null} usersLoading={statsLoading} alertsLoading={alertsLoading} />

    <section aria-labelledby="alerts-title" className="mt-8"><div className="mb-4 flex items-center justify-between gap-4"><div><h2 id="alerts-title" className="text-xl font-bold">风险预警池</h2><p className="mt-1 text-sm text-muted-foreground">仅记录黄色、红色风险；绿色正常对话不会进入预警池。</p></div><span role="status" aria-atomic="true" className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">{alerts.length} 条待处理预警</span></div>
      {notice && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{notice}</p>}
      {error && <div role="alert" className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><button type="button" onClick={() => load("manual")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 font-semibold hover:bg-red-100"><RefreshCw className="h-4 w-4" aria-hidden="true" />重试</button></div>}
      {alertsLoading ? <div className="space-y-3" aria-label="预警列表加载中">{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl border border-border bg-white/70" />)}</div> : !alertsLoaded ? <div className="ark-soft-card py-14 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-700"><RefreshCw className="h-7 w-7" aria-hidden="true" /></span><h3 className="mt-5 text-lg font-semibold">预警数据暂不可用</h3><p className="mt-2 text-sm text-muted-foreground">请确认后端服务已启动，然后点击上方重试。</p></div> : alerts.length === 0 ? <div className="ark-soft-card py-14 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Inbox className="h-7 w-7" aria-hidden="true" /></span><h3 className="mt-5 text-lg font-semibold">当前没有待跟进预警</h3><p className="mt-2 text-sm text-muted-foreground">新的风险信号出现后会自动进入这里。</p></div> : <div className="space-y-3">{orderedAlerts.map((alert) => <RiskAlertCard key={alert.id} alert={alert} handling={handlingId === alert.id} onHandle={handle} />)}</div>}
    </section>

    <div className="mt-8 flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-5 text-sm leading-6 text-violet-950"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><p>预警信息用于高校支持流程，不是医学诊断结论。请结合线下沟通和学校制度审慎处理。</p></div></div></main>;
}
