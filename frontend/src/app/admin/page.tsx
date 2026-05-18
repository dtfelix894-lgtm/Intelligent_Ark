"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Cookies from "js-cookie";
import { adminLogoutAction } from "@/app/actions/auth";
import { clearToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Phone, LogOut } from "lucide-react";
import { useScenario } from "@/lib/scenario-context";
import type { AlertCard, RiskLevel } from "@/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ─── Mock 数据 ────────────────────────────────────────────────

const MOCK_STATS = {
  university: { total: 1240, red: 1, yellow: 4, green: 1235 },
  community: { total: 386, red: 1, yellow: 3, green: 382 },
};

const MOCK_TREND = {
  university: [
    { day: "周一", risk: 42 },
    { day: "周二", risk: 55 },
    { day: "周三", risk: 38 },
    { day: "周四", risk: 61 },
    { day: "周五", risk: 47 },
    { day: "周六", risk: 33 },
    { day: "周日", risk: 29 },
  ],
  community: [
    { day: "周一", risk: 22 },
    { day: "周二", risk: 28 },
    { day: "周三", risk: 35 },
    { day: "周四", risk: 30 },
    { day: "周五", risk: 25 },
    { day: "周六", risk: 20 },
    { day: "周日", risk: 18 },
  ],
};

const MOCK_TAGS = {
  university: [
    { name: "考研压力", value: 45 },
    { name: "失眠焦虑", value: 30 },
    { name: "人际冲突", value: 15 },
    { name: "就业迷茫", value: 10 },
  ],
  community: [
    { name: "长时间未活动", value: 40 },
    { name: "极度孤独", value: 30 },
    { name: "防诈骗关注", value: 20 },
    { name: "心率异常", value: 10 },
  ],
};

const INITIAL_ALERTS: AlertCard[] = [];

const PIE_COLORS = ["#f59e0b", "#ef4444", "#10b981", "#3b82f6"];

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

/**
 * 生成事件流水主键：用 "学号/邮箱 + 时间戳" 组合哈希
 * 唯一性由 user_id 保证，稳定性由固定格式保证
 */
function makeEventId(userId: string, timestamp: string): number {
  return hashCode(`${userId}::${timestamp}`);
}

// ─── 组件 ──────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function levelStyles(level: RiskLevel) {
  if (level === "red") return { border: "border-l-4 border-red-500", bg: "bg-red-50" };
  if (level === "yellow") return { border: "border-l-4 border-amber-400", bg: "bg-amber-50" };
  return { border: "border-l-4 border-emerald-500", bg: "bg-emerald-50" };
}

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

  // 监控用户总数：按 user_id 全局去重（过滤掉空字符串和兜底占位符）
  const totalUsers = useMemo(
    () => new Set(
      allRecords
        .map((r) => r.user_id)
        .filter((uid) => uid && !uid.startsWith("legacy-"))
    ).size,
    [allRecords]
  );

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

  // ── Step 3: handleStorageEvent — eventId 稳定哈希 + user_id 注入 ──
  const handleStorageEvent = useCallback((e: StorageEvent) => {
    // 预警事件（红/黄码）
    if (e.key === "latest_ark_alert" && e.newValue) {
      try {
        const raw = JSON.parse(e.newValue);
        const level: RiskLevel =
          raw.level ||
          (raw as unknown as { risk_assessment?: { level?: RiskLevel } }).risk_assessment?.level ||
          "yellow";

        if (level === "green") return;

        const userId: string = raw.user_id || String(raw.id || Date.now());
        const timestamp: string = raw.timestamp || new Date().toISOString();

        const newAlert: AlertCard = {
          eventId: makeEventId(userId, timestamp),
          user_id: userId,
          level,
          score: raw.score ?? 50,
          tags: Array.isArray(raw.tags) ? raw.tags : [],
          summary_for_admin: raw.summary_for_admin || "",
          timestamp,
          resolved: false,
          scenario: raw.scenario || "university",
        };

        const pushIfNew = (prev: AlertCard[], alert: AlertCard) =>
          prev.some((a) => a.eventId === alert.eventId) ? prev : [alert, ...prev];

        if (newAlert.scenario === "university") {
          setUniAlerts((prev) => pushIfNew(prev, newAlert));
        } else {
          setComAlerts((prev) => pushIfNew(prev, newAlert));
        }
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
      } catch {}
    }
  }, []);

  useEffect(() => {
    window.addEventListener("storage", handleStorageEvent);
    return () => window.removeEventListener("storage", handleStorageEvent);
  }, [handleStorageEvent]);

  const trend = MOCK_TREND[scenario];
  const tagData = MOCK_TAGS[scenario];
  const actions = ACTION_CONFIG[scenario];

  const handleAlertClick = (alert: AlertCard) => {
    setSelectedAlert(alert);
    // 移动端额外打开 Sheet
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileDetailSheetOpen(true);
    }
  };
  const handleResolve = (eventId: number) => {
    if (scenario === "university") {
      setUniAlerts((prev) => prev.filter((a) => a.eventId !== eventId));
    } else {
      setComAlerts((prev) => prev.filter((a) => a.eventId !== eventId));
    }
    if (selectedAlert?.eventId === eventId) setSelectedAlert(null);
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
            onClick={handleLogout}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            🔒 退出
          </button>
        </div>
        {/* 移动端：只显示退出图标 */}
        <div className="flex sm:hidden items-center">
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
          value={totalUsers}
        />
        <StatCard label="今日红码" value={redCount} level="red" />
        <StatCard label="今日黄码" value={yellowCount} level="yellow" />
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
              <CardTitle className="text-sm sm:text-base flex items-center gap-2 whitespace-nowrap">
                <span>📈</span> {scenario === "university" ? "本周校园风险指数走势" : "本周社区风险指数走势"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="risk"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: "#ef4444", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="flex-1 min-h-0 hidden sm:block">
            <CardHeader className="pb-2 px-3 sm:px-6">
              <CardTitle className="text-sm sm:text-base flex items-center gap-2 whitespace-nowrap">
                <span>🏷️</span> {scenario === "university" ? "高频风险标签分布" : "康养风险标签分布"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="flex gap-2 sm:gap-4 items-center">
                  <ResponsiveContainer width="55%" height={160}>
                  <PieChart>
                    <Pie
                      data={tagData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {tagData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {tagData.map((t, i) => (
                    <div key={t.name} className="flex items-center gap-2 text-xs sm:text-sm">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i] }} />
                      <span className="text-muted-foreground truncate">{t.name}</span>
                      <span className="ml-auto font-medium text-foreground whitespace-nowrap">{t.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
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
                  <p className="text-xs font-medium text-muted-foreground">执行干预动作</p>
                  {actions.map((action) => (
                    <Button
                      key={action.label}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-sm hover:bg-slate-100 transition-colors"
                      onClick={() => handleResolve(selectedAlert.eventId)}
                    >
                      <span className="mr-2">{action.icon}</span>
                      {action.label}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-sm text-emerald-600 border-emerald-200 hover:bg-emerald-50 transition-colors"
                    onClick={() => handleResolve(selectedAlert.eventId)}
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
                        onClick={() => handleResolve(selectedAlert.eventId)}
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
                      handleResolve(selectedAlert.eventId);
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
    </div>
  );
}
