"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import { apiJson, logout as logoutSession } from "@/lib/api";
import { buildCampusTimeContext, DEFAULT_COMPANION_PERSONA, readCompanionPersona, saveCompanionPersona } from "@/lib/campus-companion";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CampusSidebar } from "./_components/CampusSidebar";
import { ChatComposer } from "./_components/ChatComposer";
import { ChatHeader } from "./_components/ChatHeader";
import { ChatMessageList } from "./_components/ChatMessageList";
import { SelfHelpPanel } from "./_components/SelfHelpPanel";
import type { ChatMessage, CompanionPersona, RiskAssessment } from "./_components/types";

type StudentProfile = { account: string; school?: string; student_id?: string };

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState("");
  const [campusOpen, setCampusOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [persona, setPersona] = useState<CompanionPersona>(DEFAULT_COMPANION_PERSONA);
  const historyRequest = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  const loadHistory = useCallback(async () => {
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    setLoadingHistory(true);
    setHistoryReady(false);
    setHistoryError("");
    try {
      const data = await apiJson<{ items: ChatMessage[] }>("/api/chat/history?scenario=university&limit=100", { side: "c", signal: controller.signal });
      if (historyRequest.current !== controller || controller.signal.aborted) return;
      setMessages(data.items || []);
      setHistoryReady(true);
    } catch (reason) {
      if (historyRequest.current !== controller || controller.signal.aborted) return;
      setHistoryError(reason instanceof Error ? reason.message : "历史记录加载失败，请重试");
    } finally {
      if (historyRequest.current === controller) {
        historyRequest.current = null;
        setLoadingHistory(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    void apiJson<StudentProfile>("/api/auth/c-me", { side: "c" }).then(setProfile).catch(() => undefined);
    return () => {
      historyRequest.current?.abort();
      historyRequest.current = null;
    };
  }, [loadHistory]);

  useEffect(() => { setPersona(readCompanionPersona(profile?.account)); }, [profile?.account]);

  function changePersona(next: CompanionPersona) {
    setPersona(next);
    if (!saveCompanionPersona(next, profile?.account)) {
      setError("人设已在当前页面生效，但未能保存。请允许浏览器存储后重新选择；刷新后可能恢复默认。");
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sendingRef.current || !historyReady || loadingHistory) return;
    sendingRef.current = true;
    const id = Date.now();
    setInput("");
    setError("");
    setMessages((current) => [...current, { id, role: "user", content: text }]);
    setSending(true);
    try {
      const response = await apiJson<{ reply: string; risk_assessment: RiskAssessment }>("/api/chat/stream", { method: "POST", side: "c", timeoutMs: 75000, body: { message: text, scenario: "university", companion_persona: persona, campus_context: buildCampusTimeContext() } });
      setMessages((current) => [...current, { id: id + 1, role: "assistant", content: response.reply, risk: response.risk_assessment }]);
    } catch (reason) {
      setMessages((current) => current.filter((message) => message.id !== id));
      setInput((current) => current || text);
      const message = reason instanceof Error ? reason.message : "请稍后重试";
      setError(`发送未完成：${message}。文字已保留在输入框，可编辑后重新发送。`);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function logout() {
    setLogoutBusy(true);
    setError("");
    try {
      await logoutSession("c");
      router.replace("/login");
    } catch {
      setError("退出失败，请重试");
      setLogoutBusy(false);
    }
  }

  return (
    <main id="main-content" className="ark-grid-bg min-h-[100dvh] bg-background">
      <ChatHeader onOpenCampus={() => setCampusOpen(true)} onOpenTools={() => setToolsOpen(true)} onLogout={logout} busy={logoutBusy} school={profile?.school} account={profile?.account} studentId={profile?.student_id} persona={persona} onPersonaChange={changePersona} />
      <div className="mx-auto grid h-[calc(100dvh-72px)] max-w-[1600px] grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="ark-scrollbar hidden overflow-y-auto border-r border-border bg-white/70 p-5 lg:block"><CampusSidebar /></aside>
        <section aria-label={persona === "senior_brother" ? "知心学长对话" : "知心学姐对话"} className="flex min-h-0 min-w-0 flex-col bg-background/50">
          <div className="border-b border-border bg-white/70 px-4 py-3 sm:px-6"><div className="mx-auto flex max-w-3xl items-start gap-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><p>这里可以安心倾诉。系统只在出现值得关注的风险信号时，为高校工作人员提供脱敏摘要以便按流程支持。</p></div></div>
          {historyError && <div role="alert" className="mx-4 mt-3 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:mx-6 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0 break-words">聊天记录加载失败：{historyError}</span><button type="button" onClick={loadHistory} disabled={loadingHistory} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3 font-semibold hover:bg-red-100 disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />重新加载聊天记录</button></div>}
          {error && <div role="alert" className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:mx-6">{error}</div>}
          <ChatMessageList messages={messages} loading={loadingHistory || sending} persona={persona} identity={profile?.student_id || profile?.account} />
          <ChatComposer value={input} onChange={setInput} onSubmit={send} busy={sending} persona={persona} blockedReason={loadingHistory ? "聊天记录正在加载，请稍候发送。" : !historyReady ? "请先重新加载聊天记录，输入的草稿会保留。" : undefined} />
        </section>
        <aside className="ark-scrollbar hidden overflow-y-auto border-l border-border bg-white/70 p-5 xl:block"><SelfHelpPanel instanceId="desktop-tools" /></aside>
      </div>

      <Sheet open={campusOpen} onOpenChange={setCampusOpen}><SheetContent side="left" className="ark-scrollbar w-[min(88vw,360px)] overflow-y-auto bg-background p-5"><SheetHeader className="mb-6 pr-8 text-left"><SheetTitle>校园信息</SheetTitle><SheetDescription>查看今日随机治愈语句。</SheetDescription></SheetHeader><CampusSidebar /></SheetContent></Sheet>
      <Sheet open={toolsOpen} onOpenChange={setToolsOpen}><SheetContent side="right" className="ark-scrollbar w-[min(92vw,400px)] overflow-y-auto bg-background p-5"><SheetHeader className="mb-6 pr-8 text-left"><SheetTitle>自助工具</SheetTitle><SheetDescription>声音、正念、解压锦囊和情绪释放工具。</SheetDescription></SheetHeader><SelfHelpPanel instanceId="mobile-tools" /></SheetContent></Sheet>
    </main>
  );
}
