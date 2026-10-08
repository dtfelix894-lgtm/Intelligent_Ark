"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Building2,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  LockKeyhole,
  LogOut,
  Sparkles,
  Settings,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import type { CompanionPersona } from "@/app/chat/_components/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type WarningSettings = {
  refreshMs: 3000 | 10000 | 30000;
  prioritizeHighRisk: boolean;
};

export const DEFAULT_WARNING_SETTINGS: WarningSettings = {
  refreshMs: 3000,
  prioritizeHighRisk: true,
};

type Props = {
  mode: "student" | "admin";
  school?: string;
  account?: string;
  studentId?: string;
  onLogout: () => void;
  logoutBusy?: boolean;
  warningSettings?: WarningSettings;
  onWarningSettingsChange?: (settings: WarningSettings) => void;
  companionPersona?: CompanionPersona;
  onCompanionPersonaChange?: (persona: CompanionPersona) => void;
};

const WARNING_SETTINGS_KEY = "ark_warning_settings";

function readWarningSettings(account?: string): WarningSettings {
  try {
    const stored = JSON.parse(account ? localStorage.getItem(`${WARNING_SETTINGS_KEY}:${account}`) || "null" : "null") as Partial<WarningSettings> | null;
    const refreshMs = stored?.refreshMs;
    return {
      refreshMs: refreshMs === 10000 || refreshMs === 30000 ? refreshMs : 3000,
      prioritizeHighRisk: stored?.prioritizeHighRisk !== false,
    };
  } catch {
    return DEFAULT_WARNING_SETTINGS;
  }
}

function StatusRow({ icon: Icon, title, description, status }: { icon: typeof ShieldCheck; title: string; description: string; status: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-white p-3.5">
      <span className="mt-0.5 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{status}</span>
    </div>
  );
}

export function UserSettings({ mode, school, account, studentId, onLogout, logoutBusy = false, warningSettings = DEFAULT_WARNING_SETTINGS, onWarningSettingsChange, companionPersona = "senior_sister", onCompanionPersonaChange }: Props) {
  const [settings, setSettings] = useState(warningSettings);
  const [saveError, setSaveError] = useState("");
  const isAdmin = mode === "admin";

  useEffect(() => {
    // 清理上一版左下角外观设置，避免旧偏好继续影响当前产品界面。
    delete document.documentElement.dataset.textSize;
    delete document.documentElement.dataset.reduceMotion;
    if (!isAdmin) return;
    const stored = readWarningSettings(account);
    setSettings(stored);
    onWarningSettingsChange?.(stored);
  }, [isAdmin, account, onWarningSettingsChange]);

  function updateWarningSettings(next: WarningSettings) {
    setSettings(next);
    onWarningSettingsChange?.(next);
    try {
      if (!account) throw new Error("Identity unavailable");
      localStorage.setItem(`${WARNING_SETTINGS_KEY}:${account}`, JSON.stringify(next));
      setSaveError("");
    } catch { setSaveError("设置已在当前页面生效，但未能保存。请允许浏览器存储后重新选择。"); }
  }

  const displayedId = isAdmin ? account : (studentId || account);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="打开账户与预警设置"
          className="ark-interactive inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-foreground shadow-sm hover:bg-secondary"
        >
          <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="hidden max-w-36 truncate sm:inline">{displayedId || (isAdmin ? "管理员" : "学生账号")}</span>
          <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pr-14 text-left">
          <DialogTitle>账户与预警设置</DialogTitle>
          <DialogDescription>{isAdmin ? "查看工作身份并调整高校心理预警工作台。" : "查看学生身份及系统如何保护和处理风险信息。"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          <p className="text-xs text-muted-foreground">偏好按当前账号保存在本浏览器，不会同步到其他设备。</p>
          {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
          <section aria-labelledby="account-title">
            <h2 id="account-title" className="text-sm font-bold text-muted-foreground">账户信息</h2>
            <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="flex items-center gap-3"><span className="ark-icon-tile bg-white"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span><div><p className="font-bold">{school || "学校信息未填写"}</p><p className="text-xs text-muted-foreground">{isAdmin ? "高校心理支持工作端" : "高校学生心理陪伴端"}</p></div></div>
              <dl className="mt-4 grid gap-3 border-t border-violet-100 pt-4 sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">学校</dt><dd className="mt-1 break-words text-sm font-semibold">{school || "未填写"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{isAdmin ? "工号" : "学号"}</dt><dd className="mt-1 break-all text-sm font-semibold">{displayedId || "未填写"}</dd></div>
                {!isAdmin && studentId && account && studentId !== account && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">登录账号</dt><dd className="mt-1 break-all text-sm font-semibold">{account}</dd></div>}
              </dl>
            </div>
          </section>

          {!isAdmin && <section aria-labelledby="companion-title">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /><h2 id="companion-title" className="text-sm font-bold text-muted-foreground">陪伴人设</h2></div>
            <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-sm font-semibold">你更想和谁聊？</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">选择会同步影响称呼、开场白和 AI 回复语气，随时可以更换。</p>
              <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="选择陪伴人设">
                {([{"value":"senior_sister","label":"知心学姐","note":"温柔细腻"},{"value":"senior_brother","label":"知心学长","note":"松弛可靠"}] as const).map((option) => {
                  const selected = companionPersona === option.value;
                  return <button key={option.value} type="button" aria-pressed={selected} onClick={() => onCompanionPersonaChange?.(option.value)} className={`min-h-14 cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selected ? "border-primary bg-secondary text-primary" : "border-border bg-white hover:bg-violet-50"}`}><span className="block text-sm font-bold">{option.label}</span><span className={`mt-0.5 block text-xs ${selected ? "text-primary/80" : "text-muted-foreground"}`}>{option.note}</span></button>;
                })}
              </div>
            </div>
          </section>}

          {isAdmin && <section aria-labelledby="work-settings-title">
            <div className="flex items-center gap-2"><Settings className="h-4 w-4 text-primary" aria-hidden="true" /><h2 id="work-settings-title" className="text-sm font-bold text-muted-foreground">工作台设置</h2></div>
            <div className="mt-3 space-y-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div><p className="text-sm font-semibold">自动刷新频率</p><p className="mt-1 text-xs text-muted-foreground">用于获取新的黄色、红色预警。</p><div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="自动刷新频率">{([3000, 10000, 30000] as const).map((value) => <button key={value} type="button" aria-pressed={settings.refreshMs === value} onClick={() => updateWarningSettings({ ...settings, refreshMs: value })} className={`min-h-11 rounded-xl border px-2 text-sm font-semibold transition-colors ${settings.refreshMs === value ? "border-primary bg-secondary text-primary" : "border-border bg-white hover:bg-muted"}`}>{value / 1000} 秒</button>)}</div></div>
              <div className="flex items-center gap-3 border-t border-border pt-4">
                <div className="min-w-0 flex-1">
                  <p id="priority-title" className="text-sm font-semibold">红色高风险优先</p>
                  <p id="priority-description" className="mt-1 text-xs leading-5 text-muted-foreground">开启后，红色预警优先显示，再按时间排列。</p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    role="switch"
                    aria-labelledby="priority-title"
                    aria-describedby="priority-description priority-state"
                    aria-checked={settings.prioritizeHighRisk}
                    onClick={() => updateWarningSettings({ ...settings, prioritizeHighRisk: !settings.prioritizeHighRisk })}
                    className="inline-flex h-11 w-14 items-center justify-center rounded-xl transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95"
                  >
                    <span className={`relative h-7 w-12 rounded-full transition-colors ${settings.prioritizeHighRisk ? "bg-primary" : "bg-slate-300"}`} aria-hidden="true">
                      <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${settings.prioritizeHighRisk ? "translate-x-5" : "translate-x-0"}`} />
                    </span>
                  </button>
                  <span id="priority-state" role="status" aria-live="polite" className={`text-[11px] font-semibold ${settings.prioritizeHighRisk ? "text-primary" : "text-muted-foreground"}`}>{settings.prioritizeHighRisk ? "已开启" : "按时间"}</span>
                </div>
              </div>
            </div>
          </section>}

          <section aria-labelledby="warning-title">
            <div className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-amber-700" aria-hidden="true" /><h2 id="warning-title" className="text-sm font-bold text-muted-foreground">心理预警规则</h2></div>
            <div className="mt-3 space-y-2.5">
              <StatusRow icon={TriangleAlert} title="分级响应" description="仅黄色需关注、红色高风险进入预警池；绿色正常对话不生成预警。" status="已启用" />
              <StatusRow icon={LockKeyhole} title="敏感信息保护" description="工作台只展示风险标签和脱敏摘要，心理健康信息按敏感信息审慎处理。" status="已启用" />
              <StatusRow icon={isAdmin ? BadgeCheck : ShieldCheck} title={isAdmin ? "人工复核与跟进" : "现实支持优先"} description={isAdmin ? "系统结果不是医学诊断，每条预警仍需高校工作人员结合线下情况判断并完成跟进。" : "出现明显安全风险时，系统会提示联系辅导员、心理中心或现实中的可信任人员。"} status={isAdmin ? "需人工处理" : "安全规则"} />
            </div>
          </section>

          <section aria-labelledby="basis-title" className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-emerald-700" aria-hidden="true" /><h2 id="basis-title" className="text-sm font-bold text-emerald-950">制度参考</h2></div>
            <p className="mt-2 text-xs leading-5 text-emerald-900">设置依据高校心理危机分级预警、快速反应、跟踪支持和敏感个人信息保护原则设计。</p>
            <div className="mt-3 flex flex-col gap-2 text-xs font-semibold"><a href="https://www.moe.gov.cn/srcsite/A12/moe_1407/s3020/201807/t20180713_342992.html" target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-emerald-800 underline-offset-4 hover:underline">教育部高校心理健康教育指导纲要<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a><a href="https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm" target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-emerald-800 underline-offset-4 hover:underline">中华人民共和国个人信息保护法<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a></div>
          </section>

          <button type="button" onClick={onLogout} disabled={logoutBusy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"><LogOut className="h-4 w-4" aria-hidden="true" />{logoutBusy ? "退出中…" : "退出当前账号"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
