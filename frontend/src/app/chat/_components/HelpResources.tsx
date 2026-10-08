"use client";

import { Phone, ShieldCheck, UserRoundCheck } from "lucide-react";

const hotlines = [
  { label: "24h 心理援助热线", phone: "400-161-9995" },
  { label: "北京心理危机干预", phone: "010-82951332" },
];

export function HelpResources() {
  return <div className="space-y-3"><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" /><h3 className="mt-3 font-semibold text-emerald-950">需要现实中的帮助？</h3><p className="mt-2 text-sm leading-6 text-emerald-900">请联系辅导员、学校心理中心，或身边可信任的同学和老师。</p></div><div className="rounded-2xl border border-border bg-white p-4"><div className="flex items-center gap-2"><UserRoundCheck className="h-5 w-5 text-primary" aria-hidden="true" /><h3 className="font-semibold">专业支持</h3></div><div className="mt-3 space-y-2">{hotlines.map((item) => <a key={item.phone} href={`tel:${item.phone}`} className="ark-interactive flex min-h-14 items-center justify-between rounded-xl border border-border px-3 hover:bg-muted"><span><span className="block text-sm font-semibold">{item.label}</span><span className="block text-xs text-muted-foreground">{item.phone}</span></span><Phone className="h-5 w-5 text-primary" aria-hidden="true" /></a>)}</div></div><p className="text-xs leading-5 text-muted-foreground">如果你或他人正处于紧急危险中，请立即联系当地紧急服务和现实中的专业人员。</p></div>;
}
