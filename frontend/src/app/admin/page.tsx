"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Cookies from "js-cookie";
import { adminLogoutAction } from "@/app/actions/auth";
import { clearToken, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Phone, LogOut, Users, ChevronLeft } from "lucide-react";
import { useScenario } from "@/lib/scenario-context";
import type { AlertCard, RiskLevel } from "@/types";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Mock 数据 ────────────────────────────────────────────────

const MOCK_STATS = {
  university: { total: 1240, red: 1, yellow: 4, green: 1235 },
  community: { total: 386, red: 1, yellow: 3, green: 382 },
};


const INITIAL_ALERTS: AlertCard[] = [];

const ACTION_CONFIG = {
  university: [
    { label: "联系学生/辅导员", icon: "📞" },
    { label: "转介心理中心", icon: "🏥" },
  ],
  community: [
    { label: "呼叫紧急联系人", icon: "📞" },
    { label: "派发网格员上门", icon: "🚨" },
  ],
};

const RISK_LABELS = { red: "极高风险", yellow: "中等风险", green: "情绪平稳" };
const RISK_BADGE_VARIANT = {
  red: "destructive" as const,
  yellow: "secondary" as const,
  green: "default" as const,
};

// ─── 身份与哈希工具 ───────────────────────────────────────────────

/** 将任意字符串稳定映射为非负整数（用于 eventId，避免时间戳抖动） */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 统一身份提取：双模式兼容
 * - university → user_id 为学号（如 G001）
 * - community → user_id 为邮箱或手机号
 */
function getUserIdentity(alert: Pick<AlertCard, "user_id">, scenario: "university" | "community"): string {
  return alert.user_id;
}

// ─── 组件 ──────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

// SQLite "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DD HH:MM"（不做时区换算，避免漂移）
function fmtDateTime(s: string) {
  if (!s) return "—";
  return s.replace("T", " ").slice(0, 16);
}

// 近 7 天请求分布柱状图
function DailyBars({ daily }: { daily: { date: string; count: number }[] }) {
  const map = new Map(daily.map((d) => [d.date, d.count]));
  const days: { key: string; label: string; count: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, count: map.get(key) || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="flex items-end gap-1.5" style={{ height: 100 }}>
      {days.map((d) => (
        <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full">
          <span className="text-[10px] text-slate-500 mb-0.5">{d.count || ""}</span>
          <div
            className="w-full rounded-t bg-emerald-400"
            style={{ height: `${Math.max(2, (d.count / max) * 70)}px`, opacity: d.count > 0 ? 1 : 0.2 }}
          />
          <span className="text-[10px] text-slate-400 mt-1">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function levelStyles(level: RiskLevel) {
  if (level === "red") return { border: "border-l-4 border-red-500", bg: "bg-red-50" };
  if (level === "yellow") return { border: "border-l-4 border-amber-400", bg: "bg-amber-50" };
  return { border: "border-l-4 border-emerald-500", bg: "bg-emerald-50" };
}

// 风险走势图自定义 tooltip：分级展示黄码/红码起数 + 当日平均风险分
function RiskTrendTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: { yellow: number; red: number; avg_score: number | null } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      <p className="flex items-center gap-1.5 text-amber-600"><span className="w-2 h-2 rounded-sm bg-amber-500" />黄码 {p.yellow} 起</p>
      <p className="flex items-center gap-1.5 text-red-600"><span className="w-2 h-2 rounded-sm bg-red-500" />红码 {p.red} 起</p>
      <p className="flex items-center gap-1.5 text-indigo-600 mt-0.5"><span className="w-2 h-2 rounded-sm bg-indigo-500" />平均风险分 {p.avg_score ?? "—"}</p>
    </div>
  );
}

// 标签榜单条形配色：单色 amber 按排名递减透明度（克制、不花哨）
const tagBarColor = (i: number) => `rgba(245, 158, 11, ${Math.max(0.35, 1 - i * 0.1)})`;

function StatCard({ label, value, level }: { label: string; value: number; level?: RiskLevel }) {
  const bg =
    level === "red" ? "bg-red-50 border-red-200"
    : level === "yellow" ? "bg-amber-50 border-amber-200"
    : "bg-white border-border";
  return (
    <Card className={`flex-1 ${bg} transition-colors`}>
      <CardContent className="p-3 text-center">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className={`text-2xl font-bold ${level === "red" ? "text-red-600" : level === "yellow" ? "text-amber-600" : "text-foreground"}`}>
          {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { scenario, setScenario } = useScenario();
  const [adminInfo, setAdminInfo] = useState<{ type: "G" | "C"; workerId: string; schoolName?: string } | null>(null);

  // Cookie 初始化 scenario（锁定模式，只执行一次）
  useEffect(() => {
    const saved = localStorage.getItem("b_admin_info");
    if (saved) {
      const info = JSON.parse(saved) as { type: "G" | "C"; workerId: string; schoolName?: string };
      setAdminInfo(info);
      setScenario(info.type === "G" ? "university" : "community");
    } else {
      const cookieRole = Cookies.get("b_role");
      if (cookieRole === "university" || cookieRole === "community") {
        setScenario(cookieRole);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 退出登录：先清客户端 JWT，再走 Server Action 清 cookie ──
  const handleLogout = async () => {
    if (!confirm("确定要退出登录吗？")) return;
    clearToken("b");
    localStorage.removeItem("b_admin_info");
    Cookies.remove("b_role", { path: "/" });
    await adminLogoutAction();
  };

  // ── 双场景状态物理隔离 ──
  const [uniAlerts, setUniAlerts] = useState<AlertCard[]>(INITIAL_ALERTS);
  const [comAlerts, setComAlerts] = useState<AlertCard[]>(INITIAL_ALERTS);
  const [selectedAlert, setSelectedAlert] = useState<AlertCard | null>(null);
  const [mobileDetailSheetOpen, setMobileDetailSheetOpen] = useState(false);
  const [uniStableCount, setUniStableCount] = useState(0);
  const [comStableCount, setComStableCount] = useState(0);
  const [uniStableUsers, setUniStableUsers] = useState<Set<string>>(new Set());
  const [comStableUsers, setComStableUsers] = useState<Set<string>>(new Set());

  // ── 当前场景路由：以 adminInfo（管理员实际身份）为准 ──
  // adminScenario：null → 默认为 university，type === "C" → community
  const adminScenario: "university" | "community" =
    adminInfo?.type === "C" ? "community" : "university";
  // 当前场景的预警列表（红/黄码）
  const currentAlerts = adminScenario === "university" ? uniAlerts : comAlerts;
  const currentStableCount = adminScenario === "university" ? uniStableCount : comStableCount;
  const currentStableUsers = adminScenario === "university" ? uniStableUsers : comStableUsers;

  // 实时预警池：仅显示红/黄码（绿码不进入列表）
  const filteredAlerts = useMemo(
    () => currentAlerts.filter((a) => a.level !== "green"),
    [currentAlerts]
  );

  // ── allRecords 统一计算（双模式全量记录：红黄码 + 绿码）──
  // 依赖 adminScenario 确保切换模式后立即重新计算
  const allRecords = useMemo<Array<AlertCard & { _type: "alert" | "green" }>>(() => {
    const alerts = currentAlerts;
    const greenRecords: Array<AlertCard & { _type: "green" }> = [];
    currentStableUsers.forEach((uid) => {
      greenRecords.push({
        eventId: hashCode(`green::${uid}`),
        user_id: uid,
        level: "green",
        score: 10,
        tags: [],
        summary_for_admin: "情绪平稳",
        timestamp: new Date().toISOString(),
        resolved: false,
        scenario: adminScenario,
        _type: "green",
      });
    });
    return [...alerts.map((a) => ({ ...a, _type: "alert" as const })), ...greenRecords];
  }, [currentAlerts, currentStableUsers, adminScenario]);

  // 注册老人/学生总数：以后端数据库为准（注册用户数），不依赖会话事件
  const [registeredCount, setRegisteredCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/admin/stats?scenario=${adminScenario}`, { side: "b", autoRedirectOn401: false })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.total_users === "number") {
          setRegisteredCount(data.total_users);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [adminScenario]);

  // ── 风险图表真实数据：走势 + 标签分布（按当前场景，来自 risk_events） ──
  type TrendPoint = { date: string; label: string; yellow: number; red: number; count: number; avg_score: number | null };
  type TagPoint = { tag: string; count: number };
  const [riskTrend, setRiskTrend] = useState<TrendPoint[]>([]);
  const [riskTags, setRiskTags] = useState<TagPoint[]>([]);
  // 拉取走势 + 标签；用自增 reqId 丢弃过期响应（切场景/连续刷新时只认最后一次）
  const chartReqIdRef = useRef(0);
  const refreshRiskCharts = useCallback(() => {
    const reqId = ++chartReqIdRef.current;
    apiFetch(`/api/admin/risk-trend?scenario=${adminScenario}&days=7`, { side: "b", autoRedirectOn401: false })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.items && reqId === chartReqIdRef.current) setRiskTrend(data.items); })
      .catch(() => {});
    apiFetch(`/api/admin/risk-tags?scenario=${adminScenario}&limit=7`, { side: "b", autoRedirectOn401: false })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.items && reqId === chartReqIdRef.current) setRiskTags(data.items); })
      .catch(() => {});
  }, [adminScenario]);

  // 预警池：以数据库为准，拉取「未处理」红/黄码（全部累计，不限今日）。
  // 重启后端 / 刷新页面也不丢；StorageEvent 仅作为「有新事件」的信号触发重拉。
  const alertsReqIdRef = useRef(0);
  const loadAlerts = useCallback(() => {
    const reqId = ++alertsReqIdRef.current;
    const sc = adminScenario;
    apiFetch(`/api/admin/alerts?scenario=${sc}&handled=false&limit=200`, { side: "b", autoRedirectOn401: false })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.items || reqId !== alertsReqIdRef.current) return;
        const cards: AlertCard[] = data.items.map((it: { id: number; account: string; level: RiskLevel; score: number; tags: string[]; summary: string; created_at: string; scenario: "university" | "community" }) => ({
          eventId: it.id,           // 后端 risk_events.id，作为处理时的真实主键
          user_id: it.account,
          level: it.level,
          score: it.score,
          tags: Array.isArray(it.tags) ? it.tags : [],
          summary_for_admin: it.summary || "",
          timestamp: it.created_at,
          resolved: false,
          scenario: it.scenario,
        }));
        if (sc === "university") setUniAlerts(cards);
        else setComAlerts(cards);
      })
      .catch(() => {});
  }, [adminScenario]);

  // 初次加载 + 切换场景：拉取预警池 + 图表
  useEffect(() => { loadAlerts(); refreshRiskCharts(); }, [loadAlerts, refreshRiskCharts]);
  // 收到实时预警事件后，防抖重拉预警池 + 图表（延迟 400ms 规避后端落库竞态）
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => { loadAlerts(); refreshRiskCharts(); }, 400);
  }, [loadAlerts, refreshRiskCharts]);
  useEffect(() => () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); }, []);

  const trendHasData = riskTrend.some((d) => d.count > 0);
  const maxTagCount = riskTags.reduce((m, t) => Math.max(m, t.count), 0) || 1;

  // ── 用户账号管理 ──
  type AccountUser = {
    id: number; account: string; role: string; created_at: string;
    school: string | null; student_id: string; email: string;
    request_count: number; last_active: string | null;
    red_count: number; yellow_count: number;
  };
  type UserActivity = {
    request_count: number; first_active: string | null; last_active: string | null;
    daily: { date: string; count: number }[];
  };
  type Intervention = {
    id: number; level: RiskLevel; score: number; tags: string[]; summary: string;
    action: string | null; note: string | null; handled_by: string | null;
    handled_at: string | null; created_at: string;
  };
  const [usersSheetOpen, setUsersSheetOpen] = useState(false);
  const [accountUsers, setAccountUsers] = useState<AccountUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountUser | null>(null);
  const [userActivity, setUserActivity] = useState<UserActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [userInterventions, setUserInterventions] = useState<Intervention[]>([]);

  const openUsersSheet = () => {
    setUsersSheetOpen(true);
    setSelectedAccount(null);
    setUserActivity(null);
    setUsersLoading(true);
    apiFetch(`/api/admin/users?scenario=${adminScenario}`, { side: "b", autoRedirectOn401: false })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAccountUsers(data?.items ?? []))
      .catch(() => setAccountUsers([]))
      .finally(() => setUsersLoading(false));
  };

  const openAccountDetail = (u: AccountUser) => {
    setSelectedAccount(u);
    setUserActivity(null);
    setUserInterventions([]);
    setActivityLoading(true);
    apiFetch(`/api/admin/users/${u.id}/activity?scenario=${adminScenario}`, { side: "b", autoRedirectOn401: false })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUserActivity(data))
      .catch(() => setUserActivity(null))
      .finally(() => setActivityLoading(false));
    apiFetch(`/api/admin/users/${u.id}/interventions?scenario=${adminScenario}`, { side: "b", autoRedirectOn401: false })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUserInterventions(data?.items ?? []))
      .catch(() => setUserInterventions([]));
  };

  // 红码事件数（不去重，每事件计一次）
  const redCount = useMemo(
    () => allRecords.filter((r) => r._type === "alert" && r.level === "red").length,
    [allRecords]
  );

  // 黄码事件数（不去重，每事件计一次）
  const yellowCount = useMemo(
    () => allRecords.filter((r) => r._type === "alert" && r.level === "yellow").length,
    [allRecords]
  );

  // 情绪平稳事件数（不去重，每事件计一次）
  const stableCount = currentStableCount;

  // ── 实时信号：收到 C 端预警/平稳事件 → 触发从数据库重拉（DB 为唯一事实源）──
  const handleStorageEvent = useCallback((e: StorageEvent) => {
    // 预警事件（红/黄码）：不再自维护内存列表，统一防抖重拉预警池 + 图表
    if (e.key === "latest_ark_alert" && e.newValue) {
      try {
        const raw = JSON.parse(e.newValue);
        const level: RiskLevel =
          raw.level ||
          (raw as unknown as { risk_assessment?: { level?: RiskLevel } }).risk_assessment?.level ||
          "yellow";
        if (level === "green") return;
        scheduleRefresh(); // 新预警已入库 → 重拉（含池/计数/走势/标签）
      } catch {}
    }
    // 平稳事件（绿码）
    else if (e.key === "latest_ark_green_event" && e.newValue) {
      try {
        const raw = JSON.parse(e.newValue);
        const uid: string = raw.user_id || String(raw.id || Date.now());
        if (raw.scenario === "university") {
          setUniStableCount((prev) => prev + 1);
          setUniStableUsers((prev) => new Set(prev).add(uid));
        } else {
          setComStableCount((prev) => prev + 1);
          setComStableUsers((prev) => new Set(prev).add(uid));
        }
        // 绿码不落库（内存计数即可），无需重拉 DB
      } catch {}
    }
  }, [scheduleRefresh]);

  useEffect(() => {
    window.addEventListener("storage", handleStorageEvent);
    return () => window.removeEventListener("storage", handleStorageEvent);
  }, [handleStorageEvent]);

  const actions = ACTION_CONFIG[scenario];

  const handleAlertClick = (alert: AlertCard) => {
    setSelectedAlert(alert);
    // 移动端额外打开 Sheet
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileDetailSheetOpen(true);
    }
  };
  // 干预备注（处理时一并落库）
  const [handleNote, setHandleNote] = useState("");
  const handleResolve = async (eventId: number, action?: string) => {
    try {
      const res = await apiFetch(`/api/admin/alerts/${eventId}/handle`, {
        method: "POST",
        side: "b",
        autoRedirectOn401: false,
        body: { action: action ?? null, note: handleNote.trim() || null } as unknown as BodyInit,
      });
      if (!res.ok) throw new Error();
    } catch {
      alert("处理失败，请稍后重试");
      return;
    }
    // 落库成功 → 移出待处理池（已处理记录可在「用户账号管理」中查看）
    if (adminScenario === "university") {
      setUniAlerts((prev) => prev.filter((a) => a.eventId !== eventId));
    } else {
      setComAlerts((prev) => prev.filter((a) => a.eventId !== eventId));
    }
    if (selectedAlert?.eventId === eventId) setSelectedAlert(null);
    setHandleNote("");
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col">

      {/* ── Header ── */}
      <header className="h-14 sm:h-16 bg-slate-900 text-white flex items-center justify-between px-3 sm:px-6 flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg sm:text-xl flex-shrink-0">⚓</span>
          <h1 className="font-semibold text-xs sm:text-base truncate">智伴方舟 - 情绪治理底座</h1>
        </div>
        <div className="flex items-center flex-shrink-0">
          {scenario === "university" ? (
            <span className="px-2 sm:px-3 py-1 rounded-lg bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 text-xs sm:text-sm font-medium">
              🎓 高校
            </span>
          ) : (
            <span className="px-2 sm:px-3 py-1 rounded-lg bg-amber-600/30 border border-amber-500/50 text-amber-300 text-xs sm:text-sm font-medium">
              🏘️ 社区
            </span>
          )}
        </div>
        {/* PC 端：显示工号 + 退出文字 */}
        <div className="hidden sm:flex items-center gap-4 text-sm">
          {adminInfo && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60">
              <span className={adminInfo.type === "G" ? "text-emerald-400" : "text-amber-400"}>
                {adminInfo.type === "G" ? "🎓" : "👥"}
              </span>
              <span className="text-slate-300">
                {adminInfo.workerId}
                {adminInfo.schoolName && ` · ${adminInfo.schoolName}`}
              </span>
            </div>
          )}
          <button
            onClick={openUsersSheet}
            className="text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <Users className="w-4 h-4" /> 用户账号管理
          </button>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            🔒 退出
          </button>
        </div>
        {/* 移动端：账号管理 + 退出图标 */}
        <div className="flex sm:hidden items-center gap-1">
          <button
            onClick={openUsersSheet}
            className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-all"
            title="用户账号管理"
          >
            <Users className="w-5 h-5" />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center w-9 h-9 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
            title="退出登录"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 lg:flex gap-2 sm:gap-4 px-3 sm:px-6 my-3 sm:my-4">
        <StatCard
          label={scenario === "university" ? "监控学生总数" : "独居老人总数"}
          value={registeredCount}
        />
        <StatCard label="待处理红码" value={redCount} level="red" />
        <StatCard label="待处理黄码" value={yellowCount} level="yellow" />
        <StatCard label="情绪平稳" value={stableCount} level="green" />
      </div>

      {/* ── 主体 Grid：移动端单列(预警池优先)，PC 端 12 栏 ── */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-6 px-3 sm:px-6 pb-6 min-h-0 w-full">

        {/* ── 列1: 实时预警池 — 移动端优先显示，PC 端左侧 ── */}
        <Card className="w-full lg:col-span-4 flex flex-col min-h-0 max-h-[680px] order-first lg:order-first">
          <CardHeader className="pb-2 flex-shrink-0 px-4 sm:px-6">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <span>🔔</span> 实时预警池
              <Badge variant="destructive" className="ml-auto">
                {filteredAlerts.filter((a) => !a.resolved).length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-hidden p-0 px-4 sm:px-6 pb-4">
            <ScrollArea className="h-full">
              <div className="space-y-2">
                {filteredAlerts.map((alert) => {
                  const s = levelStyles(alert.level);
                  const identity = getUserIdentity(alert, scenario);
                  return (
                    <div
                      key={alert.eventId}
                      onClick={() => handleAlertClick(alert)}
                      className={`${s.border} ${s.bg} rounded-lg p-3 cursor-pointer hover:opacity-80 transition-all border-l-[3px] animate-in fade-in slide-in-from-top-2 duration-300 ${
                        selectedAlert?.eventId === alert.eventId ? "ring-2 ring-slate-400" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">
                          {alert.level === "red" ? "🔴" : "🟡"}
                        </span>
                        <span className="font-medium text-sm text-foreground">
                          {scenario === "university" ? `学生 #${identity}` : `老人 #${identity}`}
                        </span>
                        <Badge variant={RISK_BADGE_VARIANT[alert.level]} className="ml-auto text-xs py-0">
                          {RISK_LABELS[alert.level]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        摘要: {alert.summary_for_admin.replace(/【AI脱敏摘要】/g, "")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{formatTime(alert.timestamp)}</p>
                    </div>
                  );
                })}
                {filteredAlerts.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">暂无预警工单</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ── 列2: 图表区 — 移动端紧跟预警池，PC 端中间 ── */}
        <div className="w-full lg:col-span-5 min-w-0 overflow-hidden flex flex-col gap-3 sm:gap-4 order-1 lg:order-none">
          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-2 px-3 sm:px-6">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2 whitespace-nowrap">
                  <span>📈</span> {scenario === "university" ? "校园风险走势" : "社区风险走势"}
                  <span className="text-xs font-normal text-muted-foreground">近 7 天</span>
                </CardTitle>
                <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />黄码</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" />红码</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-500" />平均分</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 relative">
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={riskTrend} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} width={28} tick={{ fontSize: 11, fill: "#a5b4fc" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<RiskTrendTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                  <Bar yAxisId="left" dataKey="yellow" stackId="a" fill="#f59e0b" maxBarSize={26} />
                  <Bar yAxisId="left" dataKey="red" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  <Line yAxisId="right" type="monotone" dataKey="avg_score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
              {!trendHasData && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-xs text-muted-foreground bg-white/75 px-3 py-1 rounded-full">近 7 天暂无风险预警</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1 min-h-0 hidden sm:block">
            <CardHeader className="pb-2 px-3 sm:px-6">
              <CardTitle className="text-sm sm:text-base flex items-center gap-2 whitespace-nowrap">
                <span>🏷️</span> {scenario === "university" ? "高频风险标签" : "康养风险标签"}
                {riskTags.length > 0 && <span className="text-xs font-normal text-muted-foreground">Top {riskTags.length} · 累计触发次数</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {riskTags.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">暂无标签数据</div>
              ) : (
                <div className="space-y-2.5">
                  {riskTags.map((t, i) => (
                    <div key={t.tag} className="flex items-center gap-2">
                      <span className="w-4 text-[11px] tabular-nums text-slate-400 text-right">{i + 1}</span>
                      <span className="w-20 sm:w-28 text-xs text-slate-700 truncate" title={t.tag}>{t.tag}</span>
                      <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{ width: `${Math.max(6, (t.count / maxTagCount) * 100)}%`, background: tagBarColor(i) }}
                        />
                      </div>
                      <span className="w-6 text-xs font-semibold tabular-nums text-slate-700 text-right">{t.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── 列3: PC 端右侧干预操作台（移动端通过 Sheet 提供） ── */}
        <Card className="hidden lg:flex w-full lg:col-span-3 flex flex-col min-h-0 max-h-[680px]">
          <CardHeader className="pb-2 flex-shrink-0">
            <CardTitle className="text-base flex items-center gap-2">
              <span>🔧</span> 干预闭环操作台
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-3 overflow-y-auto">
            {selectedAlert ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {selectedAlert.level === "red" ? "🔴" : "🟡"}
                    </span>
                    <span className="font-semibold text-sm">
                      {scenario === "university"
                        ? `学生 #${getUserIdentity(selectedAlert, scenario)}`
                        : `老人 #${getUserIdentity(selectedAlert, scenario)}`}
                    </span>
                    <Badge variant={RISK_BADGE_VARIANT[selectedAlert.level]} className="ml-auto text-xs py-0">
                      {RISK_LABELS[selectedAlert.level]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedAlert.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">评估摘要</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    {selectedAlert.summary_for_admin}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">风险评分</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          selectedAlert.level === "red" ? "bg-red-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${selectedAlert.score}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{selectedAlert.score}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">处理备注（选填）</p>
                  <textarea
                    value={handleNote}
                    onChange={(e) => setHandleNote(e.target.value)}
                    placeholder="记录干预经过 / 沟通结果…"
                    rows={2}
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400 resize-none"
                  />
                  <p className="text-xs font-medium text-muted-foreground">执行干预动作</p>
                  {actions.map((action) => (
                    <Button
                      key={action.label}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-sm hover:bg-slate-100 transition-colors"
                      onClick={() => handleResolve(selectedAlert.eventId, action.label)}
                    >
                      <span className="mr-2">{action.icon}</span>
                      {action.label}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-sm text-emerald-600 border-emerald-200 hover:bg-emerald-50 transition-colors"
                    onClick={() => handleResolve(selectedAlert.eventId, scenario === "university" ? "标记安全并结案" : "确认安全并结案")}
                  >
                    <span className="mr-2">✅</span>
                    {scenario === "university" ? "标记安全并结案" : "确认安全并结案"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground">
                <span className="text-4xl mb-2 opacity-30">🔔</span>
                <p className="text-sm">点击左侧工单查看详情</p>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── 移动端：预警池卡片的操作台 Sheet（底部滑出） ── */}
      <Sheet open={mobileDetailSheetOpen} onOpenChange={setMobileDetailSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[85vh] flex flex-col"
          style={{ background: "rgba(255,255,255,0.98)", backdropFilter: "blur(12px)" }}
        >
          <SheetHeader className="flex-shrink-0 pb-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
            <SheetTitle className="flex items-center gap-2 text-base">
              <span>🔧</span> 干预操作台
              {selectedAlert && (
                <Badge
                  variant={RISK_BADGE_VARIANT[selectedAlert.level]}
                  className="ml-auto text-xs"
                >
                  {RISK_LABELS[selectedAlert.level]}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-1 py-4 space-y-4">
            {selectedAlert ? (
              <>
                {/* 用户标识 */}
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {selectedAlert.level === "red" ? "🔴" : "🟡"}
                  </span>
                  <div>
                    <p className="font-semibold text-base">
                      {scenario === "university"
                        ? `学生 #${getUserIdentity(selectedAlert, scenario)}`
                        : `老人 #${getUserIdentity(selectedAlert, scenario)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatTime(selectedAlert.timestamp)}</p>
                  </div>
                  <Badge
                    variant={RISK_BADGE_VARIANT[selectedAlert.level]}
                    className="ml-auto text-xs px-2 py-0.5"
                  >
                    评分 {selectedAlert.score}
                  </Badge>
                </div>

                {/* 风险标签 */}
                <div className="flex flex-wrap gap-1.5">
                  {selectedAlert.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>

                {/* 评估摘要 */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">AI 评估摘要</p>
                  <div
                    className="rounded-xl p-4 text-sm leading-relaxed"
                    style={{
                      background: selectedAlert.level === "red"
                        ? "rgba(254,242,242,1)"
                        : selectedAlert.level === "yellow"
                        ? "rgba(254,252,232,1)"
                        : "#f0fdf4",
                      border: selectedAlert.level === "red"
                        ? "1px solid rgba(239,68,68,0.2)"
                        : selectedAlert.level === "yellow"
                        ? "1px solid rgba(245,158,11,0.2)"
                        : "1px solid rgba(34,197,94,0.2)",
                    }}
                  >
                    {selectedAlert.summary_for_admin}
                  </div>
                </div>

                {/* 风险进度条 */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">风险评分</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          selectedAlert.level === "red" ? "bg-red-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${selectedAlert.score}%` }}
                      />
                    </div>
                    <span className="text-base font-bold w-8 text-right">
                      {selectedAlert.score}
                    </span>
                  </div>
                </div>

                {/* 干预操作按钮 — 大尺寸适合单手操作 */}
                <div className="space-y-3 pt-1">
                  <p className="text-xs font-medium text-muted-foreground">处理备注（选填）</p>
                  <textarea
                    value={handleNote}
                    onChange={(e) => setHandleNote(e.target.value)}
                    placeholder="记录干预经过 / 沟通结果…"
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none"
                  />
                  <p className="text-xs font-medium text-muted-foreground">执行干预</p>
                  <div className="grid grid-cols-2 gap-3">
                    {actions.map((action) => (
                      <Button
                        key={action.label}
                        variant="outline"
                        size="lg"
                        className="h-14 text-sm justify-start gap-2 rounded-xl"
                        style={{
                          borderColor: selectedAlert.level === "red"
                            ? "rgba(239,68,68,0.3)"
                            : "rgba(245,158,11,0.3)",
                        }}
                        onClick={() => { handleResolve(selectedAlert.eventId, action.label); setMobileDetailSheetOpen(false); }}
                      >
                        <Phone className="w-4 h-4 flex-shrink-0" />
                        {action.label}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="default"
                    size="lg"
                    className="w-full h-12 text-base rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    onClick={() => {
                      handleResolve(selectedAlert.eventId, scenario === "university" ? "标记安全并结案" : "确认安全并结案");
                      setMobileDetailSheetOpen(false);
                    }}
                  >
                    <span className="text-lg">✅</span>
                    {scenario === "university" ? "标记安全并结案" : "确认安全并结案"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <span className="text-4xl mb-2 opacity-30">🔔</span>
                <p className="text-sm">请先从上方预警池选择工单</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── 用户账号管理 Sheet ── */}
      <Sheet open={usersSheetOpen} onOpenChange={setUsersSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[88vh] flex flex-col"
          style={{ background: "rgba(255,255,255,0.98)", backdropFilter: "blur(12px)" }}
        >
          <SheetHeader className="flex-shrink-0 pb-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
            <SheetTitle className="flex items-center gap-2 text-base">
              {selectedAccount ? (
                <>
                  <button onClick={() => { setSelectedAccount(null); setUserActivity(null); }} className="flex items-center gap-1 text-slate-500 hover:text-slate-800">
                    <ChevronLeft className="w-4 h-4" /> 返回
                  </button>
                  <span className="ml-1">账号详情</span>
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  {adminScenario === "university" ? "学生账号管理" : "独居老人账号管理"}
                  <Badge variant="secondary" className="ml-auto text-xs">{accountUsers.length} 个账号</Badge>
                </>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-1 py-3">
            {/* 列表视图 */}
            {!selectedAccount && (
              usersLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
              ) : accountUsers.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">暂无注册账号</div>
              ) : (
                <div className="space-y-2">
                  {accountUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => openAccountDetail(u)}
                      className="w-full text-left rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-slate-800 truncate">
                          {adminScenario === "university"
                            ? `${u.school || "未填学校"} · ${u.student_id}`
                            : u.email}
                        </span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {u.red_count > 0 && <Badge variant="destructive" className="text-[10px] px-1.5">红 {u.red_count}</Badge>}
                          {u.yellow_count > 0 && <Badge className="text-[10px] px-1.5 bg-amber-500 hover:bg-amber-500">黄 {u.yellow_count}</Badge>}
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <span>请求 <b className="text-slate-700">{u.request_count}</b> 次</span>
                        <span>最近活跃 {u.last_active ? fmtDateTime(u.last_active) : "—"}</span>
                        <span>注册 {fmtDateTime(u.created_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}

            {/* 详情视图 */}
            {selectedAccount && (
              <div className="space-y-4 px-1">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {adminScenario === "university"
                      ? `${selectedAccount.school || "未填学校"} · ${selectedAccount.student_id}`
                      : selectedAccount.email}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">注册于 {fmtDateTime(selectedAccount.created_at)}</p>
                </div>

                {activityLoading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
                ) : userActivity ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-slate-200 p-2.5 text-center">
                        <p className="text-xs text-muted-foreground">请求总次数</p>
                        <p className="text-xl font-bold text-slate-800">{userActivity.request_count}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2.5 text-center">
                        <p className="text-xs text-muted-foreground">首次请求</p>
                        <p className="text-xs font-medium text-slate-700 mt-1">{userActivity.first_active ? fmtDateTime(userActivity.first_active) : "—"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2.5 text-center">
                        <p className="text-xs text-muted-foreground">最近请求</p>
                        <p className="text-xs font-medium text-slate-700 mt-1">{userActivity.last_active ? fmtDateTime(userActivity.last_active) : "—"}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-2">近 7 天请求分布</p>
                      <DailyBars daily={userActivity.daily} />
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">暂无请求记录</div>
                )}

                {/* 历史干预记录：已由人工处理的红/黄码 */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">历史干预记录（已处理）</p>
                  {userInterventions.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-slate-200">暂无已处理记录</div>
                  ) : (
                    <div className="space-y-2">
                      {userInterventions.map((iv) => (
                        <div key={iv.id} className="rounded-lg border border-slate-200 p-2.5 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span>{iv.level === "red" ? "🔴" : "🟡"}</span>
                            <Badge variant={RISK_BADGE_VARIANT[iv.level]} className="text-xs py-0">{RISK_LABELS[iv.level]}</Badge>
                            <span className="text-muted-foreground">评分 {iv.score}</span>
                            <span className="ml-auto text-muted-foreground">{iv.handled_at ? fmtDateTime(iv.handled_at) : "—"}</span>
                          </div>
                          {iv.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {iv.tags.map((t) => (<Badge key={t} variant="outline" className="text-xs">{t}</Badge>))}
                            </div>
                          )}
                          <p><span className="text-muted-foreground">处理动作：</span>{iv.action || "—"}</p>
                          {iv.note && <p><span className="text-muted-foreground">备注：</span>{iv.note}</p>}
                          <p className="text-muted-foreground">处理人：{iv.handled_by || "—"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
