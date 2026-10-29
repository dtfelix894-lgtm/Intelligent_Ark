"use client";

import { Phone, ShieldAlert } from "lucide-react";
import type { CrisisSupport, HelpResourcePhone, HelpResourcesConfig } from "./types";

export const DEFAULT_CRISIS_MESSAGE =
  "这段表达需要被认真关注。请优先联系现实中的可信任人员或专业支持，不要独自硬撑。";
export const DEFAULT_TRUST = "现在就告诉身边信任的人，并联系学校心理中心。";

/** 用 /api/help-resources 配置重建危机卡片载荷（与聊天红码路径一致）。 */
export function buildCrisisFromHelp(hr: HelpResourcesConfig): CrisisSupport {
  const resources: HelpResourcePhone[] = [];
  if (hr.psych_center?.phone) {
    resources.push({ ...hr.psych_center, kind: "psych_center" });
  }
  for (const item of hr.hotlines || []) {
    if (item?.phone) resources.push({ ...item, kind: item.kind || "hotline" });
  }
  return {
    message: hr.crisis_message || DEFAULT_CRISIS_MESSAGE,
    resources,
    appointment: hr.appointment ?? null,
    configured: hr.configured,
    is_placeholder: hr.is_placeholder,
    missing_hint: hr.missing_hint ?? null,
    trust_prompt: DEFAULT_TRUST,
  };
}

type Props = {
  support: CrisisSupport;
  onOpenHelp?: () => void;
  /** 量表场景等可换标题 */
  title?: string;
  className?: string;
};

export function CrisisSupportCard({
  support,
  onOpenHelp,
  title = "危机支持",
  className = "mt-3",
}: Props) {
  return (
    <div
      className={`rounded-xl border-2 border-red-300 bg-red-50 px-3 py-3 text-sm text-red-950 shadow-sm ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold">{title}</p>
          <p className="leading-6">{support.message}</p>
          {support.trust_prompt && <p className="leading-6 text-red-900">{support.trust_prompt}</p>}
                    {support.resources?.length > 0 && (
            <div className="space-y-2">
              {support.resources.map((item) => (
                <a
                  key={`${item.label}-${item.phone}`}
                  href={`tel:${item.phone.replace(/\s+/g, "")}`}
                  className="ark-interactive flex min-h-11 items-center justify-between rounded-lg border border-red-200 bg-white px-3 text-red-950 hover:bg-red-100"
                >
                  <span>
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block text-xs text-red-800">{item.phone}</span>
                  </span>
                  <Phone className="h-4 w-4 text-red-700" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
          {support.appointment?.url && (
            <a
              href={support.appointment.url}
              target="_blank"
              rel="noreferrer"
              className="ark-interactive inline-flex min-h-11 items-center rounded-lg border border-red-200 bg-white px-3 font-semibold text-red-900 hover:bg-red-100"
            >
              {support.appointment.label || "预约心理咨询"}
            </a>
          )}
          {!support.configured && support.missing_hint && (
            <p className="text-xs leading-5 text-amber-900">{support.missing_hint}</p>
          )}
          {onOpenHelp && (
            <button
              type="button"
              onClick={onOpenHelp}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 sm:w-auto"
            >
              打开帮助资源
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
