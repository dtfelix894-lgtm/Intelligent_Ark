"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { VoiceInput, type VoiceFeedback } from "./VoiceInput";
import { companionName } from "@/lib/campus-companion";
import type { CompanionPersona } from "./types";

type Props = { value: string; onChange: (value: string) => void; onSubmit: () => void; busy: boolean; persona: CompanionPersona; blockedReason?: string; };

export function ChatComposer({ value, onChange, onSubmit, busy, persona, blockedReason }: Props) {
  const [voiceFeedback, setVoiceFeedback] = useState<VoiceFeedback | null>(null);
  const composingRef = useRef(false);
  const blocked = busy || Boolean(blockedReason);
  function submit(event: FormEvent) { event.preventDefault(); if (!blocked) onSubmit(); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // IME uses Enter to confirm a candidate; Safari may report keyCode 229
    // after compositionend even when isComposing is already false.
    if (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!blocked) onSubmit();
    }
  }
  function applyTranscript(text: string) {
    const current = value.trim();
    onChange(current ? `${current}\n${text}` : text);
  }
  return (
    <form onSubmit={submit} className="border-t border-border bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:px-6">
      <div className="mx-auto max-w-3xl">
        <label htmlFor="chat-message" className="sr-only">写下你此刻的感受</label>
        <div className="flex items-end gap-2 rounded-2xl border border-input bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <VoiceInput disabled={blocked} onTranscript={applyTranscript} onFeedback={setVoiceFeedback} />
          <textarea id="chat-message" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={keyDown} onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={() => { composingRef.current = false; }} disabled={busy} rows={1} maxLength={2000} aria-describedby="chat-composer-feedback" className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed" placeholder={busy ? `${companionName(persona)}正在回复…` : "写下你此刻的感受…"} />
          <button type="submit" disabled={blocked || !value.trim()} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50" aria-label="发送消息">{busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}</button>
        </div>
        <p id="chat-composer-feedback" aria-live="polite" className={`mt-2 text-center text-xs ${voiceFeedback?.kind === "error" ? "font-medium text-red-700" : "text-muted-foreground"}`}>
          {blockedReason || voiceFeedback?.message || "可键入或语音输入 · Enter 发送 / Shift + Enter 换行 · AI 陪伴不替代专业诊断"}
        </p>
      </div>
    </form>
  );
}
