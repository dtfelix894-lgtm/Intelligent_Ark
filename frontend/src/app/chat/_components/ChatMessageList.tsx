"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock3, HeartHandshake, ShieldAlert } from "lucide-react";
import { apiJson } from "@/lib/api";
import { buildCampusGreeting, companionName } from "@/lib/campus-companion";
import { CrisisSupportCard, buildCrisisFromHelp, DEFAULT_CRISIS_MESSAGE, DEFAULT_TRUST } from "./CrisisSupportCard";
import type { ChatMessage, CompanionPersona, CrisisSupport, HelpResourcesConfig } from "./types";

type Props = {
  messages: ChatMessage[];
  loading: boolean;
  persona: CompanionPersona;
  identity?: string;
  /** 红码/危机风险时一键打开帮助页 */
  onOpenHelp?: () => void;
};

export function ChatMessageList({ messages, loading, persona, identity, onOpenHelp }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  // 服务端和学生设备可能位于不同时区：先渲染稳定占位，挂载后再读取设备本地校园时间。
  const [greeting, setGreeting] = useState({
    eyebrow: "正在准备你的陪伴空间",
    title: "欢迎回来，先在这里缓一缓。",
    description: "可以说说刚刚发生的事，也可以只说一句“我有点累”。",
  });
  /** 历史 red 缺少 crisis_support 时的重建缓存 */
  const [fallbackCrisis, setFallbackCrisis] = useState<CrisisSupport | null>(null);

  useEffect(() => {
    if (messages.length > 0) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading]);

  useEffect(() => {
    setGreeting(buildCampusGreeting(new Date(), persona, identity));
  }, [persona, identity]);

  useEffect(() => {
    const needsRebuild = messages.some(
      (message) => message.risk?.level === "red" && !message.crisis_support,
    );
    if (!needsRebuild) return;
    let cancelled = false;
    void apiJson<HelpResourcesConfig>("/api/help-resources", { side: "c" })
      .then((hr) => {
        if (!cancelled) setFallbackCrisis(buildCrisisFromHelp(hr));
      })
      .catch(() => {
        if (!cancelled) {
          setFallbackCrisis({
            message: DEFAULT_CRISIS_MESSAGE,
            resources: [],
            appointment: null,
            configured: false,
            is_placeholder: false,
            missing_hint: "求助资源暂不可用。请稍后在「帮助」页查看，或联系学校心理中心。",
            trust_prompt: DEFAULT_TRUST,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [messages]);

  return (
    <div className="ark-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite">
      <div className="mx-auto max-w-3xl space-y-5">
        {messages.length === 0 && !loading && (
          <div className="mx-auto max-w-xl py-8 text-center sm:py-10 [@media(max-height:500px)]:py-2">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary [@media(max-height:500px)]:hidden">
              <HeartHandshake className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="mx-auto mt-5 inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 [@media(max-height:500px)]:mt-0">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {greeting.eyebrow}
            </p>
            <h2 className="mt-4 text-balance text-xl font-bold leading-8 sm:text-2xl [@media(max-height:500px)]:mt-2 [@media(max-height:500px)]:text-lg [@media(max-height:500px)]:leading-6">
              {greeting.title}
            </h2>
            <p className="mx-auto mt-3 max-w-lg leading-7 text-muted-foreground [@media(max-height:500px)]:mt-1 [@media(max-height:500px)]:text-sm [@media(max-height:500px)]:leading-5">
              {greeting.description}
            </p>
          </div>
        )}
        {messages.map((message) => {
          const elevatedRisk = message.risk && message.risk.level !== "green";
          const red = message.risk?.level === "red";
          // stream red 带 crisis_support；历史 red 用 help-resources 重建。yellow/green 不强制卡片。
          const crisis = message.crisis_support || (red ? fallbackCrisis : null);
          return (
            <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-[15px] leading-7 sm:max-w-[78%] ${
                  message.role === "user"
                    ? "rounded-tr-md bg-primary text-primary-foreground"
                    : "rounded-tl-md border border-border bg-white text-foreground shadow-sm"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                {crisis && <CrisisSupportCard support={crisis} onOpenHelp={onOpenHelp} />}
                {!crisis && elevatedRisk && (
                  <div
                    className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                      red ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-950"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {red ? (
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {red
                          ? "这段表达需要被认真关注，请优先联系现实中的可信任人员或专业支持。"
                          : "听起来你现在可能不太轻松。若需要，可打开「帮助」查看求助方式，或联系身边可信任的人。"}
                      </span>
                    </div>
                    {red && onOpenHelp && (
                      <button
                        type="button"
                        onClick={onOpenHelp}
                        className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 sm:w-auto"
                      >
                        打开危机支持 / 帮助资源
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-md border border-border bg-white px-4 py-3 text-sm text-muted-foreground shadow-sm">
              <span className="inline-flex items-center gap-2">
                <span className="flex gap-1" aria-hidden="true">
                  <i className="ark-pulse-soft h-2 w-2 rounded-full bg-primary" />
                  <i className="ark-pulse-soft h-2 w-2 rounded-full bg-primary [animation-delay:150ms]" />
                  <i className="ark-pulse-soft h-2 w-2 rounded-full bg-primary [animation-delay:300ms]" />
                </span>
                {companionName(persona)}正在认真读你的话
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
