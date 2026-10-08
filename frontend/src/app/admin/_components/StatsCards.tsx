import { Building2, TriangleAlert, Users } from "lucide-react";

type Props = {
  totalUsers: number | null;
  pendingAlerts: number | null;
  usersLoading: boolean;
  alertsLoading: boolean;
};

export function StatsCards({ totalUsers, pendingAlerts, usersLoading, alertsLoading }: Props) {
  const cards = [
    { label: "已注册学生账号", value: totalUsers, suffix: "人", loading: usersLoading, icon: Users, tone: "bg-violet-50 text-primary" },
    { label: "待跟进预警", value: pendingAlerts, suffix: "条", loading: alertsLoading, icon: TriangleAlert, tone: "bg-amber-50 text-amber-700" },
    { label: "数据范围", value: "高校", suffix: "场景", loading: false, icon: Building2, tone: "bg-emerald-50 text-emerald-700" },
  ];
  return <section aria-label="数据概览" className="grid gap-4 sm:grid-cols-3">{cards.map(({ label, value, suffix, loading, icon: Icon, tone }) => <article key={label} className="ark-soft-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-muted-foreground">{label}</p>{loading ? <div aria-label={`${label}加载中`} className="mt-4 h-9 w-24 animate-pulse rounded-lg bg-muted" /> : <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums">{value ?? "—"}{value !== null && <span className="ml-1 text-sm font-medium text-muted-foreground">{suffix}</span>}</p>}</div><span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span></div></article>)}</section>;
}
