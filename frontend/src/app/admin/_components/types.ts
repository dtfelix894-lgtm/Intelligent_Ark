export type EventStatus =
  | "pending"
  | "claimed"
  | "verifying"
  | "intervening"
  | "referred"
  | "monitoring"
  | "closed";

export type ClosureLabel = "confirmed" | "false_positive" | "undetermined" | "legacy_unlabeled";

export type RiskAlert = {
  id: number;
  user_id?: number;
  account: string;
  level: string;
  score: number;
  tags: string[];
  summary: string;
  created_at: string;
  handled?: boolean | number;
  handled_at?: string | null;
  handled_by?: string | null;
  action?: string | null;
  note?: string | null;
  assignee?: string | null;
  claimed_at?: string | null;
  status?: EventStatus | string | null;
  closed_at?: string | null;
  closure_label?: ClosureLabel | string | null;
  closure_other_person?: boolean;
  closure_note?: string | null;
  claim_due_at?: string | null;
  escalated_at?: string | null;
  is_overdue?: boolean;
  overdue_minutes?: number;
};

export type WorkspaceTab = "workbench" | "metrics" | "audit";


export type StaffMember = { id: number; account: string };

export type EventTransition = {
  id: number;
  event_id: number;
  from_status: string;
  to_status: string;
  actor: string;
  reason?: string | null;
  created_at: string;
};

export type FollowUpRecord = {
  id: number;
  event_id: number;
  type: string;
  occurred_at: string;
  summary: string;
  referral_target?: string | null;
  actor: string;
  created_at: string;
};

export type Reassessment = {
  id: number;
  event_id: number;
  due_date: string;
  completed_at?: string | null;
  result?: string | null;
  actor?: string | null;
  created_at: string;
  level?: string;
  summary?: string;
  status?: string;
  assignee?: string | null;
  student_account?: string;
};

export type AlertDetailResponse = {
  item: RiskAlert;
  related: RiskAlert[];
  transitions?: EventTransition[];
  records?: FollowUpRecord[];
  reassessments?: Reassessment[];
  next_statuses?: string[];
};

export type TrendPoint = {
  date: string;
  label: string;
  yellow: number;
  red: number;
  count: number;
  avg_score: number | null;
};

export type TagCount = { tag: string; count: number };

export type StudentRow = {
  id: number;
  account: string;
  school?: string | null;
  student_id?: string | null;
  request_count: number;
  last_active?: string | null;
  red_count: number;
  yellow_count: number;
  created_at?: string;
};

export type StudentActivity = {
  request_count: number;
  first_active?: string | null;
  last_active?: string | null;
  daily: { date: string; count: number }[];
};

export type InterventionRow = {
  id: number;
  level: string;
  score: number;
  tags: string[];
  summary: string;
  action?: string | null;
  note?: string | null;
  handled_by?: string | null;
  handled_at?: string | null;
  created_at: string;
};

export type LevelFilter = "all" | "yellow" | "red";
export type HandledFilter = "pending" | "done" | "all";
export type ViewMode = "list" | "byStudent";

export const STATUS_LABELS: Record<string, string> = {
  pending: "待认领",
  claimed: "已认领",
  verifying: "核实中",
  intervening: "干预中",
  referred: "已转介",
  monitoring: "持续关注",
  closed: "已结案",
};

export const CLOSURE_LABELS: Record<string, string> = {
  confirmed: "确认风险",
  false_positive: "误报",
  undetermined: "无法判断",
  legacy_unlabeled: "未标注",
};

export const RECORD_TYPE_LABELS: Record<string, string> = {
  interview: "约谈",
  phone: "电话",
  home_visit: "家访",
  referral: "转介",
  contact_parent: "联系家长",
  other: "其他",
  correction: "更正",
  reassessment: "复评",
};

export const TRANSITION_ACTION_LABELS: Record<string, string> = {
  claimed: "认领",
  verifying: "开始核实",
  intervening: "进入干预",
  referred: "标记已转介",
  monitoring: "转入持续关注",
  closed: "结案",
};

export function resolveStatus(alert: RiskAlert): string {
  if (alert.status) return alert.status;
  if (alert.handled) return "closed";
  if (alert.assignee) return "claimed";
  return "pending";
}

export function alertStatusLabel(alert: RiskAlert): string {
  return STATUS_LABELS[resolveStatus(alert)] || resolveStatus(alert);
}

export function formatAlertTime(value: string) {
  const normalized = value && !value.includes("T") ? value.replace(" ", "T") : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

export function formatAlertDate(value: string) {
  const normalized = value && !value.includes("T") ? value.replace(" ", "T") : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
