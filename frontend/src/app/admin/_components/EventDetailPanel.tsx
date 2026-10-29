"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Hand,
  Loader2,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api";
import type {
  AlertDetailResponse,
  FollowUpRecord,
  EventTransition,
  Reassessment,
  RiskAlert,
  StaffMember,
} from "./types";
import {
  CLOSURE_LABELS,
  RECORD_TYPE_LABELS,
  STATUS_LABELS,
  TRANSITION_ACTION_LABELS,
  alertStatusLabel,
  formatAlertDate,
  formatAlertTime,
  resolveStatus,
} from "./types";

type Props = {
  eventId: number | null;
  open: boolean;
  onClose: () => void;
  currentWorker: string;
  staff: StaffMember[];
  onClaimed: (alert: RiskAlert) => void;
  onAssigned: (alert: RiskAlert) => void;
  onUpdated: (alert: RiskAlert) => void;
  onHandled: (id: number) => void;
};

function friendlyErr(reason: unknown, fallback: string) {
  const msg = reason instanceof Error ? reason.message : fallback;
  if (msg.includes("非法") || msg.includes("不允许")) {
    return `操作被拒绝：${msg}`;
  }
  return msg || fallback;
}

function nowLocalInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventDetailPanel({
  eventId,
  open,
  onClose,
  currentWorker,
  staff,
  onClaimed,
  onAssigned,
  onUpdated,
  onHandled,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [item, setItem] = useState<RiskAlert | null>(null);
  const [related, setRelated] = useState<RiskAlert[]>([]);
  const [transitions, setTransitions] = useState<EventTransition[]>([]);
  const [records, setRecords] = useState<FollowUpRecord[]>([]);
  const [reassessments, setReassessments] = useState<Reassessment[]>([]);
  const [nextStatuses, setNextStatuses] = useState<string[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);
  const [completingRa, setCompletingRa] = useState<number | null>(null);
  const [assigneeInput, setAssigneeInput] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [closeLabel, setCloseLabel] = useState<"confirmed" | "false_positive" | "undetermined">("confirmed");
  const [closeOther, setCloseOther] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [recType, setRecType] = useState("interview");
  const [recAt, setRecAt] = useState(nowLocalInput());
  const [recSummary, setRecSummary] = useState("");
  const [recReferral, setRecReferral] = useState("");
  const [recAdvance, setRecAdvance] = useState(false);

  useEffect(() => {
    if (!open || eventId == null) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setActionNotice("");
    setItem(null);
    setRelated([]);
    setTransitions([]);
    setRecords([]);
    setReassessments([]);
    setNextStatuses([]);
    setAssignReason("");
    setCloseNote("");
    setCloseReason("");
    setReopenReason("");
    setRecSummary("");
    setRecAt(nowLocalInput());

    void apiJson<AlertDetailResponse>(`/api/admin/alerts/${eventId}?scenario=university`, {
      side: "b",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((data) => {
        if (cancelled) return;
        setItem(data.item);
        setRelated(data.related || []);
        setTransitions(data.transitions || []);
        setRecords(data.records || []);
        setReassessments(data.reassessments || []);
        setNextStatuses(data.next_statuses || []);
        setAssigneeInput(data.item.assignee || "");
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(friendlyErr(reason, "加载详情失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, eventId]);

  const status = item ? resolveStatus(item) : "pending";
  const closed = status === "closed";
  const canAddRecord = !closed && status !== "pending";

  const pendingReassess = useMemo(
    () => reassessments.filter((r) => !r.completed_at),
    [reassessments],
  );

  if (!open) return null;

  function applyEvent(next: RiskAlert, extras?: Partial<AlertDetailResponse>) {
    setItem(next);
    if (extras?.transitions) setTransitions(extras.transitions);
    if (extras?.records) setRecords(extras.records);
    if (extras?.reassessments) setReassessments(extras.reassessments);
    if (extras?.next_statuses) setNextStatuses(extras.next_statuses);
    onUpdated(next);
    if (resolveStatus(next) === "closed") onHandled(next.id);
  }

  async function claim() {
    if (!item) return;
    setClaiming(true);
    setError("");
    setActionNotice("");
    try {
      const res = await apiJson<AlertDetailResponse & { item: RiskAlert }>(`/api/admin/alerts/${item.id}/claim`, {
        method: "POST",
        side: "b",
      });
      applyEvent(res.item);
      onClaimed(res.item);
      setActionNotice(`已认领，负责人 ${res.item.assignee}`);
      // refresh next statuses via detail-ish fields
      setNextStatuses(["verifying"]);
    } catch (reason) {
      setError(friendlyErr(reason, "认领失败"));
    } finally {
      setClaiming(false);
    }
  }

  async function assign() {
    if (!item) return;
    const target = assigneeInput.trim();
    const why = assignReason.trim();
    if (!target) {
      setError("请选择或填写目标工号");
      return;
    }
    if (!why) {
      setError("改派必须填写原因");
      return;
    }
    setAssigning(true);
    setError("");
    setActionNotice("");
    try {
      const res = await apiJson<{ item: RiskAlert }>(`/api/admin/alerts/${item.id}/assign`, {
        method: "POST",
        side: "b",
        body: { assignee: target, reason: why },
      });
      applyEvent(res.item);
      onAssigned(res.item);
      setActionNotice(`已分派给 ${res.item.assignee}`);
      setAssignReason("");
    } catch (reason) {
      setError(friendlyErr(reason, "分派失败"));
    } finally {
      setAssigning(false);
    }
  }

  async function doTransition(to: string) {
    if (!item) return;
    const body: Record<string, unknown> = { to_status: to };
    if (to === "closed") {
      if (!closeNote.trim()) {
        setError("结案必须填写说明");
        return;
      }
      body.closure_label = closeLabel;
      body.closure_other_person = closeOther;
      body.closure_note = closeNote.trim();
      body.reason = closeReason.trim() || closeNote.trim();
    } else if (status === "closed" && to === "intervening") {
      if (!reopenReason.trim()) {
        setError("重开必须填写原因");
        return;
      }
      body.reason = reopenReason.trim();
    } else if (to === "monitoring" || to === "intervening" || to === "referred" || to === "verifying") {
      body.reason = closeReason.trim() || undefined;
    }
    setTransitioning(to);
    setError("");
    setActionNotice("");
    try {
      const res = await apiJson<{
        item: RiskAlert;
        next_statuses: string[];
        transitions: EventTransition[];
        reassessments: Reassessment[];
      }>(`/api/admin/alerts/${item.id}/transition`, {
        method: "POST",
        side: "b",
        body,
      });
      applyEvent(res.item, {
        next_statuses: res.next_statuses,
        transitions: res.transitions,
        reassessments: res.reassessments,
      });
      setActionNotice(`状态已更新为「${STATUS_LABELS[to] || to}」`);
      setCloseNote("");
      setCloseReason("");
      setReopenReason("");
    } catch (reason) {
      setError(friendlyErr(reason, "状态流转失败"));
    } finally {
      setTransitioning(null);
    }
  }

  async function saveRecord() {
    if (!item) return;
    if (!recSummary.trim()) {
      setError("请填写跟进说明（勿粘贴学生原话）");
      return;
    }
    setSavingRecord(true);
    setError("");
    setActionNotice("");
    try {
      const occurred = recAt.includes("T") ? recAt.replace("T", " ") + ":00" : recAt;
      const res = await apiJson<{
        record: FollowUpRecord;
        item: RiskAlert;
        records: FollowUpRecord[];
      }>(`/api/admin/alerts/${item.id}/records`, {
        method: "POST",
        side: "b",
        body: {
          type: recType,
          occurred_at: occurred,
          summary: recSummary.trim(),
          referral_target: recType === "referral" ? recReferral || null : null,
          advance_to_referred: recType === "referral" && recAdvance,
        },
      });
      setRecords(res.records || []);
      if (res.item) applyEvent(res.item);
      setActionNotice("跟进记录已追加");
      setRecSummary("");
      setRecAdvance(false);
    } catch (reason) {
      setError(friendlyErr(reason, "保存跟进记录失败"));
    } finally {
      setSavingRecord(false);
    }
  }

  async function completeRa(id: number, result: "improved" | "still_risk") {
    setCompletingRa(id);
    setError("");
    setActionNotice("");
    try {
      const res = await apiJson<{ item: Reassessment; event: RiskAlert }>(
        `/api/admin/reassessments/${id}/complete`,
        {
          method: "POST",
          side: "b",
          body: {
            result,
            note: result === "improved" ? "复评：好转" : "复评：仍有风险",
          },
        },
      );
      setReassessments((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...res.item, completed_at: res.item.completed_at || new Date().toISOString() } : r)),
      );
      if (res.event) applyEvent(res.event);
      setActionNotice(result === "improved" ? "复评完成：好转" : "复评完成：仍有风险");
    } catch (reason) {
      setError(friendlyErr(reason, "完成复评失败"));
    } finally {
      setCompletingRa(null);
    }
  }

  const red = item?.level === "red";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="event-detail-title">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="关闭详情" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-primary">事件详情 · 脱敏</p>
            <h2 id="event-detail-title" className="mt-1 text-lg font-bold">
              {item ? `事件 #${item.id}` : eventId != null ? `事件 #${eventId}` : "事件详情"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">不展示学生消息原文（ADR 0002）。打开已写审计。</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-border hover:bg-secondary" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="space-y-3" aria-label="详情加载中">
              {[0, 1, 2].map((n) => (
                <div key={n} className="h-24 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />
              ))}
            </div>
          ) : error && !item ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
          ) : item ? (
            <div className="space-y-6">
              {actionNotice ? (
                <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{actionNotice}</p>
              ) : null}
              {error ? (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
              ) : null}

              <section className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${red ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                    {red ? <ShieldAlert className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {red ? "红色 · 高风险" : "黄色 · 需关注"}
                  </span>
                  <span className="inline-flex min-h-7 items-center rounded-full bg-secondary px-2.5 text-xs font-semibold">
                    {alertStatusLabel(item)}
                  </span>
                  {item.closure_label ? (
                    <span className="inline-flex min-h-7 items-center rounded-full bg-slate-100 px-2.5 text-xs font-semibold text-slate-800">
                      标注 {CLOSURE_LABELS[item.closure_label] || item.closure_label}
                    </span>
                  ) : null}
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">学生账号</dt>
                    <dd className="font-semibold">{item.account}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">风险分数</dt>
                    <dd className="font-semibold">{item.score}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">入池时间</dt>
                    <dd>{formatAlertTime(item.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">负责人</dt>
                    <dd className="inline-flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-sky-700" />
                      {item.assignee || "未认领"}
                      {item.assignee && item.assignee === currentWorker ? "（我）" : ""}
                    </dd>
                  </div>
                </dl>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">脱敏摘要</p>
                  <p className="mt-1 leading-7">{item.summary || "该学生的对话出现了值得关注的风险信号。"}</p>
                </div>
                {item.tags?.length > 0 ? (
                  <ul aria-label="风险标签" className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <li key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{tag}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-[11px] text-muted-foreground">本面板不提供消息原文查看入口。</p>
                {closed && item.closure_note ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">结案说明：{item.closure_note}</p>
                ) : null}
              </section>

              <section className="space-y-3 rounded-2xl border border-border p-4">
                <h3 className="text-sm font-bold">状态流转</h3>
                <p className="text-xs text-muted-foreground">合法路径：待认领/已认领 → 核实/干预/关注 → 结案。非法流转将提示错误。</p>
                <div className="flex flex-wrap gap-2">
                  {status === "pending" ? (
                    <button type="button" onClick={() => void claim()} disabled={claiming} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-700 px-3 text-xs font-semibold text-white disabled:opacity-60">
                      {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand className="h-3.5 w-3.5" />}
                      认领给我
                    </button>
                  ) : null}
                  {nextStatuses.filter((s) => s !== "closed").map((to) => (
                    <button
                      key={to}
                      type="button"
                      disabled={transitioning === to || closed}
                      onClick={() => void doTransition(to)}
                      className="inline-flex min-h-10 items-center rounded-xl border border-border bg-white px-3 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
                    >
                      {transitioning === to ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      {TRANSITION_ACTION_LABELS[to] || STATUS_LABELS[to] || to}
                    </button>
                  ))}
                </div>

                {nextStatuses.includes("closed") ? (
                  <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold">结案（必填标注与说明）</p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["confirmed", "确认风险"],
                          ["false_positive", "误报"],
                          ["undetermined", "无法判断"],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={closeLabel === v}
                          onClick={() => setCloseLabel(v)}
                          className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${closeLabel === v ? "bg-slate-800 text-white" : "bg-white text-muted-foreground"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={closeOther} onChange={(e) => setCloseOther(e.target.checked)} />
                      风险对象为他人
                    </label>
                    <textarea
                      value={closeNote}
                      onChange={(e) => setCloseNote(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="结案说明（勿写学生原话）"
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={transitioning === "closed"}
                      onClick={() => void doTransition("closed")}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {transitioning === "closed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      确认结案
                    </button>
                  </div>
                ) : null}

                {closed && nextStatuses.includes("intervening") ? (
                  <div className="space-y-2 rounded-xl bg-amber-50 p-3">
                    <p className="text-xs font-semibold">重开为干预中（须填原因）</p>
                    <input
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="重开原因"
                      className="min-h-10 w-full rounded-xl border border-border px-3 text-sm"
                    />
                    <button type="button" onClick={() => void doTransition("intervening")} disabled={transitioning === "intervening"} className="inline-flex min-h-10 rounded-xl bg-amber-700 px-3 text-xs font-semibold text-white disabled:opacity-60">
                      重开
                    </button>
                  </div>
                ) : null}

                {transitions.length > 0 ? (
                  <ol className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                    {transitions.map((t) => (
                      <li key={t.id}>
                        {formatAlertTime(t.created_at)} · {STATUS_LABELS[t.from_status] || t.from_status} → {STATUS_LABELS[t.to_status] || t.to_status} · {t.actor}
                        {t.reason ? ` · ${t.reason}` : ""}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-muted-foreground">暂无流转记录</p>
                )}
              </section>

              <section className="space-y-3 rounded-2xl border border-border p-4">
                <h3 className="text-sm font-bold">认领 / 分派</h3>
                <div className="space-y-2">
                  {staff.length > 0 ? (
                    <select id="assign-assignee" value={assigneeInput} onChange={(e) => setAssigneeInput(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm" disabled={closed}>
                      <option value="">选择工作人员</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.account}>{s.account}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={assigneeInput} onChange={(e) => setAssigneeInput(e.target.value)} placeholder="管理员工号" className="min-h-11 w-full rounded-xl border border-border px-3 text-sm" disabled={closed} />
                  )}
                  <textarea value={assignReason} onChange={(e) => setAssignReason(e.target.value)} rows={2} maxLength={200} placeholder="改派原因（必填）" className="w-full rounded-xl border border-border px-3 py-2 text-sm" disabled={closed} />
                  <button type="button" onClick={() => void assign()} disabled={assigning || closed} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-900 disabled:opacity-60">
                    {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                    {item.assignee ? "改派" : "分派"}
                  </button>
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-border p-4">
                <h3 className="text-sm font-bold">跟进记录</h3>
                <p className="text-xs text-muted-foreground">只追加、不可改删。说明中不要粘贴学生原话或无关隐私（ADR 0002）。</p>
                {canAddRecord ? (
                  <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <div className="flex flex-wrap gap-2">
                      <select value={recType} onChange={(e) => setRecType(e.target.value)} className="min-h-10 rounded-lg border border-border bg-white px-2 text-xs">
                        {Object.entries(RECORD_TYPE_LABELS).filter(([k]) => k !== "reassessment").map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <input type="datetime-local" value={recAt} onChange={(e) => setRecAt(e.target.value)} className="min-h-10 rounded-lg border border-border px-2 text-xs" />
                    </div>
                    {recType === "referral" ? (
                      <div className="space-y-2">
                        <select value={recReferral} onChange={(e) => setRecReferral(e.target.value)} className="min-h-10 w-full rounded-lg border border-border bg-white px-2 text-xs">
                          <option value="">转介去向（可选）</option>
                          <option value="校医院">校医院</option>
                          <option value="精神专科医院">精神专科医院</option>
                          <option value="其他">其他</option>
                        </select>
                        {status === "intervening" ? (
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={recAdvance} onChange={(e) => setRecAdvance(e.target.checked)} />
                            同时推进状态到「已转介」
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                    <textarea value={recSummary} onChange={(e) => setRecSummary(e.target.value)} rows={2} maxLength={500} placeholder="简要说明（≤500字，勿贴原文）" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
                    <button type="button" onClick={() => void saveRecord()} disabled={savingRecord} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-700 px-3 text-xs font-semibold text-white disabled:opacity-60">
                      {savingRecord ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      追加记录
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{closed ? "已结案，记录只读。" : "认领后方可添加跟进记录。"}</p>
                )}
                {records.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无跟进记录</p>
                ) : (
                  <ul className="space-y-2">
                    {records.map((r) => (
                      <li key={r.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{RECORD_TYPE_LABELS[r.type] || r.type}</span>
                          <span>{formatAlertTime(r.occurred_at)}</span>
                          <span>{r.actor}</span>
                          {r.referral_target ? <span>去向 {r.referral_target}</span> : null}
                        </div>
                        <p className="mt-1 leading-6">{r.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-3 rounded-2xl border border-border p-4">
                <h3 className="text-sm font-bold">复评计划</h3>
                <p className="text-xs text-muted-foreground">进入持续关注或「确认风险」结案后自动生成 14/30 天提醒。结果：好转 / 仍有风险。</p>
                {pendingReassess.length === 0 && reassessments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无复评计划</p>
                ) : (
                  <ul className="space-y-2">
                    {reassessments.map((ra) => {
                      const done = Boolean(ra.completed_at);
                      return (
                        <li key={ra.id} className="rounded-xl border border-border px-3 py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold">到期 {formatAlertDate(ra.due_date)}</span>
                            {done ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">
                                已完成 · {ra.result === "improved" ? "好转" : ra.result === "still_risk" ? "仍有风险" : ra.result}
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">待复评</span>
                            )}
                          </div>
                          {!done ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button type="button" disabled={completingRa === ra.id} onClick={() => void completeRa(ra.id, "improved")} className="inline-flex min-h-9 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-60">
                                好转
                              </button>
                              <button type="button" disabled={completingRa === ra.id} onClick={() => void completeRa(ra.id, "still_risk")} className="inline-flex min-h-9 rounded-lg bg-red-700 px-3 text-xs font-semibold text-white disabled:opacity-60">
                                仍有风险
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-bold">同一学生的其他风险事件</h3>
                <p className="mt-1 text-xs text-muted-foreground">仅摘要；存储不合并（ADR 0001）。</p>
                {related.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">暂无其他事件。</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {related.map((peer) => (
                      <li key={peer.id} className="rounded-xl border border-border bg-secondary/40 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={peer.level === "red" ? "font-bold text-red-700" : "font-bold text-amber-800"}>{peer.level === "red" ? "红" : "黄"}</span>
                          <span>#{peer.id}</span>
                          <span>{alertStatusLabel(peer)}</span>
                          <time dateTime={peer.created_at}>{formatAlertTime(peer.created_at)}</time>
                        </div>
                        <p className="mt-1 leading-6">{peer.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}