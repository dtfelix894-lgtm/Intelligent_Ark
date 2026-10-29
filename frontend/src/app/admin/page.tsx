"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { apiJson, logout as logoutSession } from "@/lib/api";
import { DEFAULT_WARNING_SETTINGS, type WarningSettings } from "@/components/UserSettings";
import { AdminHeader } from "./_components/AdminHeader";
import { AlertPool } from "./_components/AlertPool";
import { useAdminAlertsStream } from "./_components/useAdminAlertsStream";
import { EventDetailPanel } from "./_components/EventDetailPanel";
import { ReassessmentBanner } from "./_components/ReassessmentBanner";
import { MetricsDashboard, type MetricsPayload } from "./_components/MetricsDashboard";
import { AuditLogPanel, type AuditLogRow } from "./_components/AuditLogPanel";
import { ConfigSummaryCard, type ConfigSummary } from "./_components/ConfigSummaryCard";
import { RiskTagsChart } from "./_components/RiskTagsChart";
import { RiskTrendChart } from "./_components/RiskTrendChart";
import { StatsCards } from "./_components/StatsCards";
import { StudentRoster } from "./_components/StudentRoster";
import type {
  HandledFilter,
  LevelFilter,
  Reassessment,
  RiskAlert,
  StaffMember,
  TagCount,
  TrendPoint,
  ViewMode,
  WorkspaceTab,
} from "./_components/types";

function isPoolLevel(level: string) {
  return level === "yellow" || level === "red";
}

function parseTime(value: string) {
  const normalized = value && !value.includes("T") ? value.replace(" ", "T") : value;
  const t = new Date(normalized).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export default function AdminPage() {
  const router = useRouter();
  const [school, setSchool] = useState("");
  const [worker, setWorker] = useState("");
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [pendingStats, setPendingStats] = useState<{ total: number; red: number } | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [tags, setTags] = useState<TagCount[] | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [handledFilter, setHandledFilter] = useState<HandledFilter>("pending");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [handlingId, setHandlingId] = useState<number | null>(null);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reassessItems, setReassessItems] = useState<Reassessment[]>([]);
  const [reassessToday, setReassessToday] = useState(0);
  const [reassessOverdue, setReassessOverdue] = useState(0);
  const [reassessLoading, setReassessLoading] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("workbench");
  const [overdueCount, setOverdueCount] = useState(0);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [auditItems, setAuditItems] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditActor, setAuditActor] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [configSummary, setConfigSummary] = useState<ConfigSummary | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [sseLive, setSseLive] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [warningSettings, setWarningSettings] = useState<WarningSettings>(DEFAULT_WARNING_SETTINGS);
  const activeLoad = useRef<AbortController | null>(null);
  const loadSequence = useRef(0);

  const alertsQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("scenario", "university");
    params.set("limit", "200");
    if (levelFilter !== "all") params.set("level", levelFilter);
    if (handledFilter === "pending") params.set("handled", "false");
    if (handledFilter === "done") params.set("handled", "true");
    params.set("_refresh", String(Date.now()));
    return params.toString();
  }, [levelFilter, handledFilter]);

  const patchAlert = useCallback((next: RiskAlert) => {
    setAlerts((current) => {
      const status = next.status || (next.handled ? "closed" : next.assignee ? "claimed" : "pending");
      // 「待跟进」= 非 closed：结案后从当前待跟进列表移除
      if (status === "closed" && handledFilter === "pending") {
        return current.filter((item) => item.id !== next.id);
      }
      const exists = current.some((item) => item.id === next.id);
      if (!exists) return current;
      return current.map((item) => (item.id === next.id ? { ...item, ...next } : item));
    });
  }, [handledFilter]);

  const loadReassess = useCallback(async () => {
    setReassessLoading(true);
    try {
      const data = await apiJson<{
        items: Reassessment[];
        today_count: number;
        overdue_count: number;
      }>("/api/admin/reassessments?due=upcoming&limit=50", { side: "b", cache: "no-store" });
      const overdue = await apiJson<{ items: Reassessment[]; overdue_count: number }>(
        "/api/admin/reassessments?due=overdue&limit=50",
        { side: "b", cache: "no-store" },
      );
      const today = await apiJson<{ items: Reassessment[]; today_count: number }>(
        "/api/admin/reassessments?due=today&limit=50",
        { side: "b", cache: "no-store" },
      );
      const merged = [...(today.items || []), ...(overdue.items || [])];
      const seen = new Set<number>();
      const uniq: Reassessment[] = [];
      for (const row of merged) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        uniq.push(row);
      }
      setReassessItems(uniq);
      setReassessToday(data.today_count ?? today.today_count ?? today.items?.length ?? 0);
      setReassessOverdue(data.overdue_count ?? overdue.overdue_count ?? overdue.items?.length ?? 0);
      // prefer counts from dedicated calls
      setReassessToday(today.today_count ?? today.items?.length ?? 0);
      setReassessOverdue(overdue.overdue_count ?? overdue.items?.length ?? 0);
    } catch {
      /* 复评接口失败不阻断主台 */
    } finally {
      setReassessLoading(false);
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError("");
    try {
      const data = await apiJson<MetricsPayload>("/api/admin/metrics?scenario=university&days=7", {
        side: "b",
        cache: "no-store",
      });
      setMetrics(data);
    } catch (reason) {
      setMetricsError(reason instanceof Error ? reason.message : "看板加载失败");
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async (actor = "", action = "") => {
    setAuditLoading(true);
    setAuditError("");
    setAuditActor(actor);
    setAuditAction(action);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (actor) params.set("actor", actor);
      if (action) params.set("action", action);
      const data = await apiJson<{ items: AuditLogRow[] }>(`/api/admin/audit-logs?${params.toString()}`, {
        side: "b",
        cache: "no-store",
      });
      setAuditItems(data.items || []);
    } catch (reason) {
      setAuditError(reason instanceof Error ? reason.message : "审计日志加载失败");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const data = await apiJson<ConfigSummary>("/api/admin/config-summary", { side: "b", cache: "no-store" });
      setConfigSummary(data);
    } catch {
      setConfigSummary(null);
    } finally {
      setConfigLoading(false);
    }
  }, []);


  const load = useCallback(
    async (mode: "initial" | "manual" | "poll" = "initial") => {
      if (mode === "poll" && activeLoad.current) return;
      const sequence = ++loadSequence.current;
      activeLoad.current?.abort();
      const controller = new AbortController();
      activeLoad.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 12000);

      if (mode === "initial") {
        setAlertsLoading(true);
        setStatsLoading(true);
        setOverviewLoading(true);
      } else if (mode === "manual") {
        setRefreshing(true);
      }

      try {
        const params = new URLSearchParams(alertsQuery);
        params.set("_refresh", String(Date.now()));
        const alertPath = `/api/admin/alerts?${params.toString()}`;

        const pendingPath = `/api/admin/alerts?scenario=university&handled=false&limit=200&_refresh=${Date.now()}`;
        const [alertsResult, statsResult, trendResult, tagsResult, pendingResult] = await Promise.allSettled([
          apiJson<{ items: RiskAlert[]; overdue_count?: number }>(alertPath, { side: "b", cache: "no-store", signal: controller.signal }),
          apiJson<{ total_users: number }>(`/api/admin/stats?scenario=university&_refresh=${Date.now()}`, {
            side: "b",
            cache: "no-store",
            signal: controller.signal,
          }),
          apiJson<{ items: TrendPoint[] }>(`/api/admin/risk-trend?scenario=university&days=7&_refresh=${Date.now()}`, {
            side: "b",
            cache: "no-store",
            signal: controller.signal,
          }),
          apiJson<{ items: TagCount[] }>(`/api/admin/risk-tags?scenario=university&limit=8&_refresh=${Date.now()}`, {
            side: "b",
            cache: "no-store",
            signal: controller.signal,
          }),
          apiJson<{ items: RiskAlert[] }>(pendingPath, { side: "b", cache: "no-store", signal: controller.signal }),
        ]);
        if (sequence !== loadSequence.current) return;

        const failures: string[] = [];
        if (alertsResult.status === "fulfilled") {
          const items = (alertsResult.value.items || []).filter((item) => isPoolLevel(item.level));
          setAlerts(items);
          setAlertsLoaded(true);
          if (typeof alertsResult.value.overdue_count === "number") {
            setOverdueCount(alertsResult.value.overdue_count);
          } else {
            setOverdueCount(items.filter((item) => item.is_overdue).length);
          }
        } else {
          failures.push("预警列表加载失败");
        }
        if (statsResult.status === "fulfilled") {
          setTotalUsers(statsResult.value.total_users ?? 0);
        } else {
          failures.push("学生账号统计加载失败");
        }
        if (pendingResult.status === "fulfilled") {
          const pendingItems = (pendingResult.value.items || []).filter((item) => isPoolLevel(item.level));
          setPendingStats({
            total: pendingItems.length,
            red: pendingItems.filter((item) => item.level === "red").length,
          });
        }

        const overviewFails: string[] = [];
        if (trendResult.status === "fulfilled") {
          setTrend(trendResult.value.items || []);
        } else {
          overviewFails.push("风险走势");
        }
        if (tagsResult.status === "fulfilled") {
          setTags(tagsResult.value.items || []);
        } else {
          overviewFails.push("风险标签");
        }
        setOverviewError(overviewFails.length ? `${overviewFails.join("、")}加载失败` : "");

        if (mode === "poll") {
          // 静默轮询：成功则清错误；失败不打断已有列表
          if (failures.length === 0) setError("");
        } else {
          setError(failures.length ? `${failures.join("；")}。请确认后端服务已启动后重试。` : "");
        }
      } finally {
        window.clearTimeout(timeout);
        if (sequence === loadSequence.current) {
          activeLoad.current = null;
          setAlertsLoading(false);
          setStatsLoading(false);
          setOverviewLoading(false);
          setRefreshing(false);
        }
      }
    },
    [alertsQuery],
  );


  const mergeStreamAlert = useCallback(
    (item: RiskAlert) => {
      if (!isPoolLevel(item.level)) return;

      // 与当前列表筛选对齐，避免 SSE 塞进不符合筛选的卡片
      if (levelFilter !== "all" && item.level !== levelFilter) {
        // 仍更新超时计数（若可）
        if (item.is_overdue && !item.handled) {
          setOverdueCount((n) => n + 1);
        }
        return;
      }
      const isPending = !item.handled && item.status !== "closed";
      if (handledFilter === "pending" && !isPending) return;
      if (handledFilter === "done" && isPending) return;

      setAlerts((current) => {
        const idx = current.findIndex((row) => row.id === item.id);
        if (idx >= 0) {
          const next = current.slice();
          next[idx] = { ...current[idx], ...item };
          return next;
        }
        return [item, ...current];
      });
      setAlertsLoaded(true);
      if (item.is_overdue && isPending) {
        setOverdueCount((n) => n + 1);
      }
      if (isPending) {
        setPendingStats((prev) => {
          if (!prev) return { total: 1, red: item.level === "red" ? 1 : 0 };
          // 粗略 +1；完整校准仍靠轮询
          return {
            total: prev.total + 1,
            red: prev.red + (item.level === "red" ? 1 : 0),
          };
        });
      }
    },
    [levelFilter, handledFilter],
  );

  const sseStatus = useAdminAlertsStream(true, {
    onAlertCreated: mergeStreamAlert,
    onLive: () => setSseLive(true),
    onFallback: () => setSseLive(false),
  });

  useEffect(() => {
    void apiJson<{ account: string; school_name?: string }>("/api/auth/b-me", { side: "b" })
      .then((profile) => {
        setWorker(profile.account || "");
        setSchool(profile.school_name || "");
      })
      .catch(() => undefined);
    void apiJson<{ items: StaffMember[] }>("/api/admin/staff", { side: "b", cache: "no-store" })
      .then((data) => setStaff(data.items || []))
      .catch(() => setStaff([]));
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void load("initial");
    void loadReassess();
    // SSE live 时放缓轮询作兜底；断开则用设置的 refreshMs（默认 1s）
    const pollMs = sseLive ? Math.max(warningSettings.refreshMs, 10000) : warningSettings.refreshMs;
    const timer = window.setInterval(() => {
      void load("poll");
    }, pollMs);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load("poll");
    };
    const refreshOnFocus = () => {
      void load("poll");
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshOnFocus);
      activeLoad.current?.abort();
    };
  }, [load, loadReassess, warningSettings.refreshMs, sseLive]);

  useEffect(() => {
    if (workspaceTab === "metrics") void loadMetrics();
    if (workspaceTab === "audit") void loadAudit(auditActor, auditAction);
  }, [workspaceTab, loadMetrics, loadAudit, auditActor, auditAction]);

  const orderedAlerts = useMemo(() => {
    const list = [...alerts];
    list.sort((left, right) => {
      if (warningSettings.pinOverdue === true) {
        const overdueDiff = (right.is_overdue ? 1 : 0) - (left.is_overdue ? 1 : 0);
        if (overdueDiff !== 0) return overdueDiff;
      }
      if (warningSettings.prioritizeHighRisk && handledFilter === "pending") {
        const riskDifference = (right.level === "red" ? 1 : 0) - (left.level === "red" ? 1 : 0);
        if (riskDifference !== 0) return riskDifference;
      }
      return parseTime(right.created_at) - parseTime(left.created_at);
    });
    return list;
  }, [alerts, warningSettings.prioritizeHighRisk, warningSettings.pinOverdue, handledFilter]);

  async function handle(id: number) {
    setHandlingId(id);
    setError("");
    setNotice("");
    try {
      await apiJson(`/api/admin/alerts/${id}/handle`, {
        method: "POST",
        side: "b",
        body: { action: "follow_up", note: "已由高校工作端跟进" },
      });
      setAlerts((current) => current.filter((alert) => alert.id !== id));
      setNotice("已快速结案（标注：未标注）。事件已移出待跟进。");
      await load("poll");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "跟进保存失败，请重试");
    } finally {
      setHandlingId(null);
    }
  }

  async function claim(id: number) {
    setClaimingId(id);
    setError("");
    setNotice("");
    try {
      const res = await apiJson<{ item: RiskAlert }>(`/api/admin/alerts/${id}/claim`, {
        method: "POST",
        side: "b",
      });
      patchAlert(res.item);
      setNotice(`已认领事件 #${id}，负责人 ${res.item.assignee}`);
      await load("poll");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "认领失败，请重试");
    } finally {
      setClaimingId(null);
    }
  }

  async function logout() {
    setLogoutBusy(true);
    try {
      await logoutSession("b");
      try {
        localStorage.removeItem("ark_admin_school");
        localStorage.removeItem("ark_admin_worker");
      } catch {
        /* ignore */
      }
      router.replace("/admin-login");
    } catch {
      setError("退出失败，请重试");
      setLogoutBusy(false);
    }
  }

  return (
    <main id="main-content" className="ark-grid-bg min-h-screen">
      <AdminHeader
        school={school}
        worker={worker}
        onLogout={logout}
        busy={logoutBusy}
        warningSettings={warningSettings}
        onWarningSettingsChange={setWarningSettings}
        onRefresh={() => void load("manual")}
        refreshing={refreshing || alertsLoading}
        onOpenStudents={() => setStudentsOpen(true)}
        overdueCount={overdueCount}
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">高校场景 · 实时工作台</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">学生心理风险管理</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              与学生端风险入池联通：仅黄/红事件进入预警池。
              {sseLive || sseStatus === "live"
                ? " 实时推送已连接，轮询作兜底。"
                : ` 轮询约每 ${warningSettings.refreshMs / 1000} 秒（推送未连接时）。`}
              列表默认按入池时间新→旧。展示脱敏摘要，不展示消息原文。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load("manual")}
            disabled={refreshing || alertsLoading || statsLoading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            {refreshing ? "刷新中…" : "立即刷新"}
          </button>
        </div>


        <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-border bg-white p-1 w-fit">
          {(
            [
              ["workbench", "工作台"],
              ["metrics", "数据看板"],
              ["audit", "审计日志"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={workspaceTab === id}
              onClick={() => setWorkspaceTab(id)}
              className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${
                workspaceTab === id ? "bg-violet-700 text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {workspaceTab === "workbench" ? (
        <>
        <StatsCards
          totalUsers={totalUsers}
          pendingAlerts={pendingStats ? pendingStats.total : null}
          redPending={pendingStats ? pendingStats.red : null}
          usersLoading={statsLoading}
          alertsLoading={alertsLoading && !pendingStats}
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <RiskTrendChart
            items={trend}
            loading={overviewLoading && !trend}
            error={overviewError.includes("走势") ? overviewError : ""}
            onRetry={() => void load("manual")}
          />
          <RiskTagsChart
            items={tags}
            loading={overviewLoading && !tags}
            error={overviewError.includes("标签") ? overviewError : ""}
            onRetry={() => void load("manual")}
          />
        </div>

        <ReassessmentBanner
          todayCount={reassessToday}
          overdueCount={reassessOverdue}
          items={reassessItems}
          loading={reassessLoading}
          onOpenEvent={setDetailId}
          onRefresh={() => void loadReassess()}
        />

        <AlertPool
          alerts={orderedAlerts}
          alertsLoaded={alertsLoaded}
          alertsLoading={alertsLoading}
          levelFilter={levelFilter}
          handledFilter={handledFilter}
          viewMode={viewMode}
          onLevelFilter={setLevelFilter}
          onHandledFilter={setHandledFilter}
          onViewMode={setViewMode}
          handlingId={handlingId}
          claimingId={claimingId}
          onHandle={(id) => void handle(id)}
          onClaim={(id) => void claim(id)}
          onOpenDetail={setDetailId}
          currentWorker={worker}
          error={error}
          notice={notice}
          onRetry={() => void load("manual")}
          prioritizeHighRisk={warningSettings.prioritizeHighRisk}
        />

                <div className="mt-8 flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-5 text-sm leading-6 text-violet-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p>
            支持状态流转、跟进记录、复评与结案标注；「标记已跟进」仍为快速结案（closed + 未标注）。待跟进=未结案。超时未认领事件会置顶并在页头显示数量。
          </p>
        </div>

        <ConfigSummaryCard data={configSummary} loading={configLoading} />
        </>
        ) : workspaceTab === "metrics" ? (
          <MetricsDashboard
            data={metrics}
            loading={metricsLoading}
            error={metricsError}
            onRetry={() => void loadMetrics()}
          />
        ) : (
          <AuditLogPanel
            items={auditItems}
            loading={auditLoading}
            error={auditError}
            onRetry={() => void loadAudit(auditActor, auditAction)}
            onFilter={(actor, action) => void loadAudit(actor, action)}
          />
        )}
      </div>

      <StudentRoster open={studentsOpen} onOpenChange={setStudentsOpen} />

      <EventDetailPanel
        eventId={detailId}
        open={detailId != null}
        onClose={() => setDetailId(null)}
        currentWorker={worker}
        staff={staff}
        onClaimed={(alert) => {
          patchAlert(alert);
          setNotice(`已认领事件 #${alert.id}，负责人 ${alert.assignee}`);
        }}
        onAssigned={(alert) => {
          patchAlert(alert);
          setNotice(`事件 #${alert.id} 已分派给 ${alert.assignee}`);
        }}
        onUpdated={(alert) => {
          patchAlert(alert);
          void loadReassess();
        }}
        onHandled={(id) => {
          setAlerts((current) => current.filter((alert) => alert.id !== id));
          setNotice("事件已结案，已移出待跟进。");
          void load("poll");
          void loadReassess();
        }}
      />
    </main>
  );
}
