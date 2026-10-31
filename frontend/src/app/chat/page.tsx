"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import { apiJson, logout as logoutSession } from "@/lib/api";
import { buildCampusTimeContext, DEFAULT_COMPANION_PERSONA, normalizeCompanionPersona, readCompanionPersona, saveCompanionPersona, saveCompanionPersonaRemote } from "@/lib/campus-companion";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CampusSidebar } from "./_components/CampusSidebar";
import { ChatComposer } from "./_components/ChatComposer";
import { ChatHeader } from "./_components/ChatHeader";
import { ChatMessageList } from "./_components/ChatMessageList";
import { SelfHelpPanel } from "./_components/SelfHelpPanel";
import type { ChatMessage, CompanionPersona, CrisisSupport, RiskAssessment } from "./_components/types";

type StudentProfile = { account: string; school?: string; student_id?: string; companion_persona?: string };

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
  const [toolsTab, setToolsTab] = useState("relax");
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
    void apiJson<StudentProfile>("/api/auth/c-me", { side: "c" })
      .then((me) => {
        setProfile(me);
        // COMP-06：优先服务端人设；无则回落本机缓存。
        if (me.companion_persona) {
          const serverPersona = normalizeCompanionPersona(me.companion_persona);
          setPersona(serverPersona);
          saveCompanionPersona(serverPersona, me.account);
        } else {
          setPersona(readCompanionPersona(me.account));
        }
      })
      .catch(() => undefined);
    return () => {
      historyRequest.current?.abort();
      historyRequest.current = null;
    };
  }, [loadHistory]);

  async function changePersona(next: CompanionPersona) {
    setPersona(next);
    const localOk = saveCompanionPersona(next, profile?.account);
    const remoteOk = await saveCompanionPersonaRemote(next);
    if (!remoteOk && !localOk) {
      setError("人设已在当前页面生效，但未能保存。请检查网络并允许浏览器存储后重新选择。");
    } else if (!remoteOk) {
      setError("人设暂未同步到账号，请联网后重试。");
    } else {
      setError("");
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
      const response = await apiJson<{ reply: string; risk_assessment: RiskAssessment; crisis_support?: CrisisSupport }>("/api/chat/stream", { method: "POST", side: "c", timeoutMs: 75000, body: { message: text, scenario: "university", companion_persona: persona, campus_context: buildCampusTimeContext() } });
      setMessages((current) => [...current, { id: id + 1, role: "assistant", content: response.reply, risk: response.risk_assessment, crisis_support: response.crisis_support }]);
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

  function openTools(tab: "relax" | "release" | "help" | "assess" = "relax") {
    setToolsTab(tab);
    // 窄屏打开自助工具抽屉；宽屏右侧栏已可见，仅切换 tab。
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches) {
      setToolsOpen(true);
    }
  }

  function openHelp() {
    openTools("help");
  }

  return (
    <main id="main-content" className="ark-grid-bg min-h-[100dvh] bg-background">
      <ChatHeader onOpenCampus={() => setCampusOpen(true)} onOpenTools={() => openTools("relax")} onLogout={logout} busy={logoutBusy} school={profile?.school} account={profile?.account} studentId={profile?.student_id} persona={persona} onPersonaChange={changePersona} />
      <div className="mx-auto grid h-[calc(100dvh-72px)] max-w-[1600px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="ark-scrollbar hidden overflow-y-auto border-r border-violet-100/80 bg-gradient-to-b from-violet-50/50 via-background/80 to-emerald-50/25 p-4 sm:p-5 lg:block">
          <CampusSidebar
            persona={persona}
            school={profile?.school}
            account={profile?.account}
            studentId={profile?.student_id}
          />
        </aside>
        <section aria-label={persona === "senior_brother" ? "知心学长对话" : "知心学姐对话"} className="flex min-h-0 min-w-0 flex-col bg-gradient-to-b from-violet-50/20 via-background/60 to-background/80">
          <div className="border-b border-border bg-white/70 px-4 py-3 sm:px-6"><div className="mx-auto flex max-w-3xl items-start gap-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><p>这是你的私密陪伴空间。我是 AI，不能替代专业帮助；若感到很不安全，请打开「帮助」联系身边可信任的人。</p></div></div>
          {historyError && <div role="alert" className="mx-4 mt-3 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:mx-6 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0 break-words">聊天记录加载失败：{historyError}</span><button type="button" onClick={loadHistory} disabled={loadingHistory} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3 font-semibold hover:bg-red-100 disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />重新加载聊天记录</button></div>}
          {error && <div role="alert" className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:mx-6">{error}</div>}
          <ChatMessageList messages={messages} loading={loadingHistory || sending} persona={persona} identity={profile?.student_id || profile?.account} onOpenHelp={openHelp} />
          <ChatComposer value={input} onChange={setInput} onSubmit={send} busy={sending} persona={persona} blockedReason={loadingHistory ? "聊天记录正在加载，请稍候发送。" : !historyReady ? "请先重新加载聊天记录，输入的草稿会保留。" : undefined} />
        </section>
        <aside className="ark-scrollbar hidden overflow-y-auto border-l border-border bg-white/70 p-5 xl:block"><SelfHelpPanel instanceId="desktop-tools" tab={toolsTab} onTabChange={setToolsTab} messages={messages} onOpenHelp={openHelp} /></aside>
      </div>

      <Sheet open={campusOpen} onOpenChange={setCampusOpen}>
        <SheetContent
          side="left"
          className="ark-scrollbar flex w-[min(92vw,380px)] flex-col gap-0 overflow-y-auto border-violet-100/80 bg-gradient-to-b from-violet-50/40 via-background to-emerald-50/20 p-0"
        >
          <SheetHeader className="shrink-0 border-b border-violet-100/70 bg-white/80 px-5 pb-4 pt-5 pr-12 text-left backdrop-blur-sm">
            <SheetTitle>校园状态</SheetTitle>
            <SheetDescription>问候、今日摘要与每日治愈。</SheetDescription>
          </SheetHeader>
          <div className="flex-1 px-4 py-4 sm:px-5 sm:py-5">
            <CampusSidebar
              persona={persona}
              school={profile?.school}
              account={profile?.account}
              studentId={profile?.student_id}
            />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={toolsOpen} onOpenChange={setToolsOpen}><SheetContent side="right" className="ark-scrollbar w-[min(92vw,400px)] overflow-y-auto bg-background p-5"><SheetHeader className="mb-6 pr-8 text-left"><SheetTitle>自助工具</SheetTitle><SheetDescription>声音、正念、解压锦囊和情绪释放工具。</SheetDescription></SheetHeader><SelfHelpPanel instanceId="mobile-tools" tab={toolsTab} onTabChange={setToolsTab} messages={messages} onOpenHelp={openHelp} /></SheetContent></Sheet>
    </main>
  );
}
