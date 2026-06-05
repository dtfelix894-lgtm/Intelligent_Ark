"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useToast } from "@/lib/use-toast";
import { useScenario } from "@/lib/scenario-context";
import { apiFetch, getToken, clearToken } from "@/lib/api";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { EmotionShredder } from "./components/EmotionShredder";
import type { ChatMessage } from "@/types";
import { cn } from "@/lib/utils";
import { Smile, Heart, Lock, LogOut, GraduationCap, Building2, Hash, Menu, Music, Volume2, Phone, AlertCircle, RefreshCw, Mic, MicOff, Keyboard, Loader2 } from "lucide-react";

// 将字符串稳定映射为非负整数，作为预警卡片的唯一 id
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Mock 用户数据类型定义
interface StudentUser {
  role: "student";
  account?: string; // 登录账号，老人/学生身份的稳定标识
  school: string;
  degree: string;
  studentId: string;
  displayName: string;
}

interface SocialUser {
  role: "social";
  account?: string; // 登录账号，老人身份的稳定标识
  phone: string;
  email?: string;
  displayName: string;
}

type CurrentUser = StudentUser | SocialUser;

// Mock 用户数据 - 模拟当前登录用户
const MOCK_USER_STUDENT: StudentUser = {
  role: "student",
  account: "2023001122",
  school: "保定学院",
  degree: "本科生",
  studentId: "2023001122",
  displayName: "张同学",
};

const MOCK_USER_SOCIAL: SocialUser = {
  role: "social",
  account: "138****5678",
  phone: "138****5678",
  email: "zhang_senior@example.com",
  displayName: "社区用户",
};

// API 请求统一走 apiFetch，无需再维护 API_BASE

const DEV_MESSAGES = {
  normal: "今天感觉不错",
  yellow_alert: "我已经连续好几天睡不着了，一闭眼全是烦心事",
  red_alert: "我觉得活着没什么意思了，不想再坚持了",
  green: "今天阳光真好，心情也不错",
};

const QUICK_ACTIONS = {
  university: ["聊聊学业压力", "我最近总是失眠", "人际关系好难"],
  community: [
    "今天身体不太舒服",
    "睡不好觉",
    "想儿女了",
    "今天天气怎么样",
    "降压药忘了吃怎么办",
    "给我讲个笑话",
    "教我防诈骗知识",
    "想听段戏曲",
  ],
} as const;

const SCENARIO_LABELS = {
  university: "高校模式",
  community: "社区模式",
};

// ── 能量补给电台数据 ───────────────────────────────────────────
interface Song {
  id: string;
  title: string;
  artist: string;
  cover: string; // emoji 作为封面
  url: string;
}

const SONGS: Song[] = [
  { id: "medal", title: "勋章", artist: "鹿晗", cover: "🏅", url: "/sounds/medal.mp3" },
  { id: "lemon-tree", title: "Lemon Tree", artist: "Fool's Garden", cover: "🍋", url: "/sounds/lemon-tree.mp3" },
  { id: "piano", title: "钢琴纯音", artist: "理查德·克莱德曼", cover: "🎹", url: "/sounds/piano.mp3" },
];

// ── 解压锦囊数据 ─────────────────────────────────────────────
interface TipCategory {
  id: string;
  label: string;
  icon: string;
  tips: string[];
}

const STRESS_RELIEF_DATA: TipCategory[] = [
  {
    id: "breathing",
    label: "呼吸调节",
    icon: "🌬️",
    tips: [
      "4-7-8 呼吸法：吸气4秒，屏气7秒，呼气8秒，重复3次",
      "腹式呼吸：双手放在腹部，缓慢吸气让腹部鼓起，再缓缓吐出",
      "交替鼻孔呼吸：左手按住左鼻孔，用右鼻孔吸气，再换边呼气",
      "每天早晨做5分钟深呼吸，给一天的状态打好基础",
    ],
  },
  {
    id: "movement",
    label: "身体活动",
    icon: "🏃",
    tips: [
      "起身活动5分钟，伸展肩颈和腰椎，缓解久坐疲劳",
      "散步10分钟，接受自然光，有助于调节情绪",
      "简单拉伸：颈部画圈、肩部后旋、腰部扭转",
      "做一组开合跳，让心跳加速，释放内啡肽",
    ],
  },
  {
    id: "emotion",
    label: "情绪记录",
    icon: "📝",
    tips: [
      "写下3件今天让你感激的事，哪怕很小",
      "把烦恼写在纸上，然后撕掉，象征放下",
      "记录当天最有成就感的1件事，哪怕是按时吃饭",
      "给未来的自己写一封信，描述你希望实现的目标",
    ],
  },
  {
    id: "life",
    label: "生活小确幸",
    icon: "☕",
    tips: [
      "给自己冲一杯热饮，短暂放空几分钟",
      "整理一下桌面，干净的环境带来好心情",
      "看一段喜欢的短视频或笑话，笑一笑",
      "给自己做一顿饭，专注于烹饪的过程",
    ],
  },
];

// ── 正念放松音频 ─────────────────────────────────────────────
type Scenario = "university" | "community";

const getBeijingHour = () =>
  parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Shanghai",
    }).format(new Date()),
    10
  );

const UNIVERSITY_GREETINGS: Record<string, string> = {
  night: "嗨~ 这么晚还没睡，是不是因为学业或者考研焦虑失眠了？别怕，学姐陪着你，有什么心事尽情吐槽吧 🌙",
  morning: "早安呀！新的一天开始了，今天有没有按时吃早饭？无论遇到什么挑战，我都为你加油哦 ☀️",
  afternoon: "下午好~ 上课/泡图书馆是不是有点累了？喝口水，伸个懒腰，给自己留点喘息的空间呀 ☕",
  evening: "晚上好！忙碌了一天辛苦啦。如果有压力别憋在心里，随时找我聊聊呀 🌻",
};

const COMMUNITY_GREETINGS: Record<string, string> = {
  night: "爷爷/奶奶，这么晚还没休息呀？是不是哪儿不舒服睡不着？我在这儿陪您说说话 🌙",
  morning: "爷爷/奶奶早安！今天天气不错，记得吃早饭和降压药哦。有什么开心的事跟我分享一下吧 ☀️",
  afternoon: "下午好呀！午觉睡得香吗？下午可以在屋里走动走动，活动一下筋骨 🍵",
  evening: "晚上好！看完新闻联播了吗？泡个脚准备早点休息哦，我一直陪着您 🌻",
};

function getTimeSlot(): string {
  const h = getBeijingHour();
  if (h >= 0 && h < 6) return "night";
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 19) return "afternoon";
  return "evening";
}

function buildWelcomeMessage(scenario: "university" | "community"): string {
  const slot = getTimeSlot();
  return scenario === "university"
    ? UNIVERSITY_GREETINGS[slot]
    : COMMUNITY_GREETINGS[slot];
}

// community 专用：把"爷爷/奶奶"替换为偏好称呼
type ElderHonorific = "grandpa" | "grandma";
function personalizeCommunityGreeting(text: string, pref: ElderHonorific | null): string {
  if (!pref) return text;
  const label = pref === "grandpa" ? "爷爷" : "奶奶";
  return text.replace(/爷爷\/奶奶/g, label);
}

export default function ChatPage() {
  const { scenario, setScenario } = useScenario();

  const [universityMessages, setUniversityMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      content: buildWelcomeMessage("university"),
    },
  ]);

  const [communityMessages, setCommunityMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      content: buildWelcomeMessage("community"),
    },
  ]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [avatarClickCount, setAvatarClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // 赛博解压游戏全屏状态
  const [activeGame, setActiveGame] = useState<null | "shredder" | "typing">(null);
  // 打字发泄墙：飞字列表
  interface FlyingChar { id: number; char: string; x: number; y: number; vx: number; vy: number; color: string; size: number; }
  const [flyingChars, setFlyingChars] = useState<FlyingChar[]>([]);
  const flyCharIdRef = useRef(0);
  const typingContainerRef = useRef<HTMLDivElement>(null);
  // 正念放松站播放状态（互斥，与能量电台逻辑对齐）
  const [playingRelax, setPlayingRelax] = useState<string | null>(null);
  // 解压锦囊弹窗状态
  const [stressDialogOpen, setStressDialogOpen] = useState(false);
  // 能量电台播放状态
  const [playingSong, setPlayingSong] = useState<string | null>(null);
  const [playingRadio, setPlayingRadio] = useState<string | null>(null);
  // 能量电台 + 正念放松站：统一的 Refs 字典映射（彻底告别 getElementById）
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  // P2.2 TTS：服务端神经语音（MiMo）播放用的 audio 元素 + 当前 objectURL
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsUrlRef = useRef<string | null>(null);
  // A：点击朗读后的合成中状态（用于按钮 loading + 可取消） + 取消用的 AbortController
  const ttsAbortRef = useRef<AbortController | null>(null);
  // B：回复落定后后台预合成的音频缓存（msgId → objectURL）+ 正在预合成的 msgId 去重集合
  const ttsCacheRef = useRef<Map<number, string>>(new Map());
  const ttsPrefetchingRef = useRef<Set<number>>(new Set());
  // 从 localStorage 读取登录用户数据，未读到则使用 Mock 数据兜底
  const [currentUser] = useState<CurrentUser>(() => {
    try {
      const saved = localStorage.getItem("currentUser");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.role === "student" || parsed.role === "social") {
          return parsed;
        }
      }
    } catch {}
    return MOCK_USER_STUDENT;
  });
  const { toast } = useToast();

  // ── community 专用状态（university 不受影响） ──
  type CommunityTip = { icon: string; text: string; time: string };
  type CommunityHotline = { label: string; phone: string };
  const [communityContext, setCommunityContext] = useState<{
    daily_tips?: CommunityTip[];
    hotlines?: CommunityHotline[];
  } | null>(null);
  const [familyPhone, setFamilyPhone] = useState<string>("");
  const [tipsChecked, setTipsChecked] = useState<Record<string, boolean>>({});
  const [timedOutMsgs, setTimedOutMsgs] = useState<Record<number, string>>({});
  const [sosOpen, setSosOpen] = useState(false);

  // P2.1 字号缩放：0.9 / 1.0 / 1.15 / 1.3
  const [fontScale, setFontScale] = useState<number>(1.15);
  // P2.5 称呼偏好
  const [honorific, setHonorific] = useState<ElderHonorific | null>(null);
  const [honorificDialogOpen, setHonorificDialogOpen] = useState(false);
  // P2.2 TTS 当前正在朗读的消息 id
  const [speakingMsgId, setSpeakingMsgId] = useState<number | null>(null);
  // A：当前正在合成（等待 TTS 返回）的消息 id —— 用于按钮显示"合成中…"
  const [ttsLoadingMsgId, setTtsLoadingMsgId] = useState<number | null>(null);
  // 微信风格：文字/语音模式切换（仅 community）
  const [voiceMode, setVoiceMode] = useState(false);
  // 按住说话：正在按压中
  const [holding, setHolding] = useState(false);
  // 抬手后等待后端转写中
  const [transcribing, setTranscribing] = useState(false);
  // 按住点的 Y 坐标（用于上滑取消判定）
  const holdStartYRef = useRef<number>(0);
  const [holdCancel, setHoldCancel] = useState(false);
  // WAV 录音相关（用 Web Audio 采集 PCM，打包成 wav 上传，智谱 ASR 需要 wav/mp3 等格式）
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sourceSampleRateRef = useRef<number>(44100);
  const recordStartAtRef = useRef<number>(0);

  // 静态兜底（后端无响应时使用）
  const FALLBACK_TIPS: CommunityTip[] = [
    { icon: "💊", text: "晨间降压药记得按时吃", time: "08:00" },
    { icon: "🚶", text: "天气好时下楼散步10分钟", time: "10:00" },
    { icon: "🍚", text: "中午饭记得清淡少盐", time: "12:00" },
    { icon: "📺", text: "今晚19:00 新闻联播", time: "19:00" },
    { icon: "🛏️", text: "睡前泡脚，早点休息", time: "21:30" },
  ];

  // 进入 community 模式时拉取场景上下文
  useEffect(() => {
    if (scenario !== "community") return;
    let cancelled = false;
    apiFetch(`/api/scenario/context?scenario=community`, {
      side: "c",
      autoRedirectOn401: false,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setCommunityContext(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scenario]);

  // 家人紧急电话：本地持久化
  useEffect(() => {
    const saved = localStorage.getItem("emergency_family_phone") || "";
    setFamilyPhone(saved);
  }, []);

  // P2.1 字号缩放持久化
  useEffect(() => {
    const saved = parseFloat(localStorage.getItem("community_font_scale") || "");
    if (!isNaN(saved) && saved >= 0.8 && saved <= 1.6) setFontScale(saved);
  }, []);
  const setFontScalePersist = (v: number) => {
    setFontScale(v);
    localStorage.setItem("community_font_scale", String(v));
  };

  // P2.5 称呼偏好：首次进入 community 时弹窗选择
  useEffect(() => {
    if (scenario !== "community") return;
    const saved = localStorage.getItem("community_honorific");
    if (saved === "grandpa" || saved === "grandma") {
      setHonorific(saved);
    } else {
      setHonorificDialogOpen(true);
    }
  }, [scenario]);

  const chooseHonorific = (h: ElderHonorific) => {
    setHonorific(h);
    localStorage.setItem("community_honorific", h);
    setHonorificDialogOpen(false);
    // 同步刷新欢迎语（仅当第一条是欢迎消息 id===0 时）
    setCommunityMessages((prev) => {
      if (!prev.length || prev[0].id !== 0) return prev;
      return [
        { ...prev[0], content: personalizeCommunityGreeting(buildWelcomeMessage("community"), h) },
        ...prev.slice(1),
      ];
    });
  };

  // P2.6 问候语实时刷新：返回页面 / 场景切换时根据当前时段+称呼重建
  useEffect(() => {
    if (scenario !== "community") return;
    const refresh = () => {
      setCommunityMessages((prev) => {
        if (!prev.length || prev[0].id !== 0) return prev;
        const next = personalizeCommunityGreeting(buildWelcomeMessage("community"), honorific);
        if (prev[0].content === next) return prev;
        return [{ ...prev[0], content: next }, ...prev.slice(1)];
      });
    };
    refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const timer = window.setInterval(refresh, 30 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(timer);
    };
  }, [scenario, honorific]);

  // P2.2 TTS：组件卸载/切场景时停止朗读 & 清理录音
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {}
      if (ttsAudioRef.current) { ttsAudioRef.current.onended = null; ttsAudioRef.current.onerror = null; try { ttsAudioRef.current.pause(); } catch {} ttsAudioRef.current = null; }
      if (ttsUrlRef.current) { try { URL.revokeObjectURL(ttsUrlRef.current); } catch {} ttsUrlRef.current = null; }
      try { ttsAbortRef.current?.abort(); } catch {}
      ttsCacheRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
      ttsCacheRef.current.clear();
      try { scriptNodeRef.current?.disconnect(); } catch {}
      try { sourceNodeRef.current?.disconnect(); } catch {}
      try { audioCtxRef.current?.close(); } catch {}
      mediaStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      mediaStreamRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (scenario !== "community") {
      try {
        window.speechSynthesis?.cancel();
      } catch {}
      if (ttsAudioRef.current) { ttsAudioRef.current.onended = null; ttsAudioRef.current.onerror = null; try { ttsAudioRef.current.pause(); } catch {} ttsAudioRef.current = null; }
      if (ttsUrlRef.current) { try { URL.revokeObjectURL(ttsUrlRef.current); } catch {} ttsUrlRef.current = null; }
      try { ttsAbortRef.current?.abort(); } catch {}
      ttsCacheRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
      ttsCacheRef.current.clear();
      setSpeakingMsgId(null);
      setTtsLoadingMsgId(null);
    }
  }, [scenario]);

  // 停止一切朗读：服务端音频 + 浏览器 Web Speech
  const stopSpeaking = () => {
    try { window.speechSynthesis?.cancel(); } catch {}
    const audio = ttsAudioRef.current;
    if (audio) {
      // 先摘掉处理器，避免 pause/revoke 触发 error 事件级联到 Web Speech 兜底
      audio.onended = null;
      audio.onerror = null;
      try { audio.pause(); } catch {}
      ttsAudioRef.current = null;
    }
    if (ttsUrlRef.current) {
      try { URL.revokeObjectURL(ttsUrlRef.current); } catch {}
      ttsUrlRef.current = null;
    }
  };

  // 播放一个（已缓存或刚合成的）服务端音频 objectURL。
  // URL 归 ttsCacheRef 所有：停止时只 pause、不撤销，统一在清理时撤销，保证可重复播放。
  const playTtsUrl = async (msgId: number, url: string, content: string) => {
    const audio = new Audio(url);
    ttsAudioRef.current = audio;
    audio.onended = () => {
      ttsAudioRef.current = null;
      setSpeakingMsgId((cur) => (cur === msgId ? null : cur));
    };
    audio.onerror = () => {
      ttsAudioRef.current = null;
      setSpeakingMsgId((cur) => (cur === msgId ? null : cur));
      speakViaWebSpeech(msgId, content);
    };
    setSpeakingMsgId(msgId);
    await audio.play();
  };

  // B：回复落定后后台静默预合成 TTS，存入缓存；用户点朗读时直接秒播
  const prefetchTts = useCallback((msgId: number, content: string) => {
    if (scenario !== "community") return;
    if (!content || content === "正在输入..." || content === "__TIMEOUT__") return;
    if (ttsCacheRef.current.has(msgId) || ttsPrefetchingRef.current.has(msgId)) return;
    ttsPrefetchingRef.current.add(msgId);
    apiFetch("/api/tts", { method: "POST", side: "c", body: { text: content, scenario } as any })
      .then(async (res) => {
        if (res.ok) {
          const blob = await res.blob();
          ttsCacheRef.current.set(msgId, URL.createObjectURL(blob));
        }
      })
      .catch(() => {})
      .finally(() => ttsPrefetchingRef.current.delete(msgId));
  }, [scenario]);

  // 点按朗读：community 优先走服务端神经 TTS（活人感），失败/未配置则回退浏览器 Web Speech
  const speakMessage = async (msgId: number, content: string) => {
    // 再次点击正在朗读的 = 停止
    if (speakingMsgId === msgId) {
      stopSpeaking();
      setSpeakingMsgId(null);
      return;
    }
    // A：再次点击正在"合成中"的同一条 = 取消合成
    if (ttsLoadingMsgId === msgId) {
      ttsAbortRef.current?.abort();
      return;
    }
    stopSpeaking();

    if (scenario === "community") {
      // B：命中预合成缓存 → 直接秒播，无需等待 / 无 loading
      const cached = ttsCacheRef.current.get(msgId);
      if (cached) {
        try {
          await playTtsUrl(msgId, cached, content);
          return;
        } catch {
          // 播放失败（如自动播放策略）→ 落到下方 Web Speech 兜底
        }
      } else {
        // 未命中 → 现场合成，A：显示"合成中…" + 可取消
        const controller = new AbortController();
        ttsAbortRef.current = controller;
        setTtsLoadingMsgId(msgId);
        try {
          const res = await apiFetch("/api/tts", {
            method: "POST",
            side: "c",
            body: { text: content, scenario } as any,
            signal: controller.signal,
          });
          if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            ttsCacheRef.current.set(msgId, url); // 顺手缓存，二次点击秒播
            await playTtsUrl(msgId, url, content);
            return;
          }
          // 非 2xx（含未配置 key 的 502）→ 回退
        } catch (e: any) {
          if (e?.name === "AbortError") return; // 用户主动取消，不回退、不报错
          // 其它网络/播放异常 → 回退
        } finally {
          setTtsLoadingMsgId((cur) => (cur === msgId ? null : cur));
          if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
        }
      }
    }
    speakViaWebSpeech(msgId, content);
  };

  // 浏览器内置 Web Speech 朗读（兜底）
  const speakViaWebSpeech = (msgId: number, content: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      toast({ title: "当前浏览器不支持朗读", description: "建议换用系统自带浏览器", duration: 2200 });
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();

    const doSpeak = () => {
      const utter = new SpeechSynthesisUtterance(content);
      utter.lang = "zh-CN";
      utter.rate = 0.95;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      const voices = synth.getVoices();
      const zh = voices.find((v) => /zh|cmn|Chinese/i.test(v.lang) || /Chinese|中文/i.test(v.name));
      if (zh) utter.voice = zh;
      utter.onend = () => setSpeakingMsgId((cur) => (cur === msgId ? null : cur));
      utter.onerror = (e: any) => {
        console.warn("TTS error:", e?.error);
        setSpeakingMsgId((cur) => (cur === msgId ? null : cur));
        if (e?.error && e.error !== "interrupted" && e.error !== "canceled") {
          toast({ title: "朗读失败", description: "系统 TTS 未就绪，请稍后再试", duration: 2200 });
        }
      };
      try {
        synth.speak(utter);
        setSpeakingMsgId(msgId);
      } catch (err) {
        console.warn("TTS speak failed:", err);
        toast({ title: "朗读失败", duration: 2000 });
      }
    };

    // 部分 Android WebView voices 为异步加载
    if (synth.getVoices().length === 0) {
      const onVoices = () => {
        synth.removeEventListener?.("voiceschanged", onVoices);
        doSpeak();
      };
      synth.addEventListener?.("voiceschanged", onVoices);
      // 兜底：1s 后仍然尝试朗读（某些设备不触发事件）
      setTimeout(() => {
        synth.removeEventListener?.("voiceschanged", onVoices);
        if (speakingMsgId !== msgId) doSpeak();
      }, 1000);
    } else {
      doSpeak();
    }
  };

  // ── WAV 编码工具（16kHz mono PCM） ────────────────────────────────────
  const TARGET_SR = 16000;

  const downsampleTo16k = (input: Float32Array, srcRate: number): Float32Array => {
    if (srcRate === TARGET_SR) return input;
    const ratio = srcRate / TARGET_SR;
    const outLen = Math.floor(input.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      let count = 0;
      for (let j = start; j < end; j++) { sum += input[j]; count++; }
      out[i] = count ? sum / count : 0;
    }
    return out;
  };

  const encodeWav = (samples: Float32Array, sampleRate: number): Blob => {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buf);
    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);          // PCM header size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, 1, true);           // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true);           // block align
    view.setUint16(34, 16, true);          // bits per sample
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++, off += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  };

  const cleanupRecorder = () => {
    try { scriptNodeRef.current?.disconnect(); } catch {}
    try { sourceNodeRef.current?.disconnect(); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
    scriptNodeRef.current = null;
    sourceNodeRef.current = null;
    audioCtxRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    mediaStreamRef.current = null;
    pcmChunksRef.current = [];
  };

  const startHoldRecord = async (clientY: number) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const isInsecure = typeof window !== "undefined" && !window.isSecureContext;
      toast({
        title: "当前浏览器不支持录音",
        description: isInsecure ? "手机端需用 https:// 地址打开" : "请换用系统浏览器",
        duration: 3000,
      });
      return;
    }
    holdStartYRef.current = clientY;
    setHoldCancel(false);
    setHolding(true);
    pcmChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      mediaStreamRef.current = stream;

      const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) throw new Error("AudioContext 不可用");
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;
      sourceSampleRateRef.current = ctx.sampleRate;
      // 浏览器自动暂停策略：必须在用户手势内 resume
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch {}
      }

      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      // ScriptProcessorNode 已废弃但仍可用，优先于 AudioWorklet 的便携性
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      scriptNodeRef.current = processor;
      processor.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        // 必须复制，inputBuffer 会被重用
        pcmChunksRef.current.push(new Float32Array(ch));
      };
      source.connect(processor);
      processor.connect(ctx.destination);

      recordStartAtRef.current = Date.now();
    } catch (err: any) {
      console.warn("getUserMedia failed:", err);
      setHolding(false);
      cleanupRecorder();
      const name = err?.name || "";
      const msg =
        name === "NotAllowedError" || name === "SecurityError"
          ? "麦克风权限未开启"
          : name === "NotFoundError"
            ? "未检测到麦克风设备"
            : "无法访问麦克风";
      toast({ title: msg, duration: 2200 });
    }
  };

  const stopHoldRecord = async (cancel: boolean) => {
    setHolding(false);
    const duration = Date.now() - recordStartAtRef.current;
    const chunks = pcmChunksRef.current.slice();
    const srcRate = sourceSampleRateRef.current;
    cleanupRecorder();

    if (cancel) {
      toast({ title: "已取消发送", duration: 1500 });
      return;
    }
    if (duration < 1000) {
      toast({ title: "按住时间需 ≥1 秒", description: "说完再松手", duration: 1800 });
      return;
    }
    if (!chunks.length) {
      toast({ title: "没录到声音，请检查麦克风", duration: 1800 });
      return;
    }

    // 合并 + 降采样到 16kHz + 打包 wav
    const totalLen = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(totalLen);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }

    // 能量检测：RMS 太低说明是静音
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < merged.length; i++) {
      const v = merged[i];
      sumSq += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    const rms = Math.sqrt(sumSq / merged.length);
    console.log(`[ASR] 采样=${merged.length} 源SR=${srcRate} 时长=${duration}ms RMS=${rms.toFixed(5)} 峰值=${peak.toFixed(3)}`);
    if (peak < 0.005) {
      toast({ title: "没检测到声音", description: "请检查麦克风是否被静音或换个输入设备", duration: 2500 });
      return;
    }

    const down = downsampleTo16k(merged, srcRate);
    const wav = encodeWav(down, TARGET_SR);
    console.log(`[ASR] WAV 大小=${wav.size}B`);

    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", wav, "voice.wav");
      const res = await apiFetch("/api/asr/transcribe", { method: "POST", side: "c", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (data && data.detail) || `转写失败 (${res.status})`;
        toast({ title: "识别失败", description: String(detail), duration: 2800 });
        return;
      }
      const text = (data.text || "").trim();
      if (!text) {
        toast({ title: "没听清，请再按住说一次", duration: 1800 });
        return;
      }
      sendMessage(text);
    } catch (err: any) {
      console.warn("ASR 请求失败:", err);
      toast({ title: "网络不稳定", description: "请稍后再试", duration: 2200 });
    } finally {
      setTranscribing(false);
    }
  };

  // P2.7 软键盘弹起时滚动到底（仅 community）
  useEffect(() => {
    if (scenario !== "community") return;
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (!vv) return;
    const onResize = () => {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [scenario]);

  const saveFamilyPhone = (p: string) => {
    setFamilyPhone(p);
    if (p) localStorage.setItem("emergency_family_phone", p);
    else localStorage.removeItem("emergency_family_phone");
  };

  const communityTips: CommunityTip[] =
    communityContext?.daily_tips && communityContext.daily_tips.length
      ? communityContext.daily_tips
      : FALLBACK_TIPS;

  const communityHotlines: CommunityHotline[] =
    communityContext?.hotlines && communityContext.hotlines.length
      ? communityContext.hotlines
      : [
          { label: "紧急急救", phone: "120" },
          { label: "社区服务热线", phone: "12345" },
        ];

  // ── 检查认证状态：无 token 则跳转登录页 ──
  useEffect(() => {
    if (!getToken("c")) {
      window.location.href = "/login";
    }
  }, []);

  // ── 移动端音频解锁：全局触摸静默初始化（获取 User Gesture Token） ──
  useEffect(() => {
    const unlockAudio = () => {
      const audioEl = audioRefs.current["medal"];
      if (audioEl && !audioEl.src) {
        audioEl.src = `${window.location.origin}/sounds/medal.mp3`;
        audioEl.volume = 0;
        audioEl.load();
      }
      // 解锁一次后立即移除监听器，防止影响性能
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("click", unlockAudio);
    };

    document.addEventListener("touchstart", unlockAudio, { once: true });
    document.addEventListener("click", unlockAudio, { once: true });

    return () => {
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("click", unlockAudio);
    };
  }, []);

  // ── Task 1 & 3: 根据用户角色自动初始化 / 同步 scenario ──
  useEffect(() => {
    if (currentUser.role === "social") {
      setScenario("community");
    } else {
      // student 默认使用高校模式，无需额外处理（context 默认值已是 university）
    }
  }, [currentUser.role, setScenario]);

  const currentMessages = useMemo(
    () => (scenario === "university" ? universityMessages : communityMessages),
    [scenario, universityMessages, communityMessages]
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => { scrollToBottom(); }, [currentMessages, isLoading]);

  const sendMessage = useCallback(
    async (text: string, devOverride?: string) => {
      if (!text.trim() || isLoading) return;
      const userMsg: ChatMessage = { id: Date.now(), role: "user", content: text };

      if (scenario === "university") {
        setUniversityMessages((prev) => [...prev, userMsg]);
      } else {
        setCommunityMessages((prev) => [...prev, userMsg]);
      }

      setInput("");
      setIsLoading(true);

      const loadingId = Date.now() + 1;
      if (scenario === "university") {
        setUniversityMessages((prev) => [
          ...prev,
          { id: loadingId, role: "assistant", content: "正在输入..." },
        ]);
      } else {
        setCommunityMessages((prev) => [
          ...prev,
          { id: loadingId, role: "assistant", content: "正在输入..." },
        ]);
      }

      // community 场景：45s 超时 + 重试兜底（university 不受影响）
      // 注：glm-4.7 等大模型平均响应 10-25s，超时设过短会误伤
      const controller = scenario === "community" ? new AbortController() : null;
      const timeoutId = controller
        ? window.setTimeout(() => controller.abort(), 45000)
        : null;

      try {
        // 以登录账号为稳定身份标识；旧数据兜底到 studentId/phone（不再用 Date.now，避免同一用户多 ID）
        const userIdentifier =
          currentUser.account ||
          (currentUser as StudentUser).studentId ||
          (currentUser as SocialUser).phone ||
          "未知用户";

        const endpoint = "/api/chat/stream-sse";

        const res = await apiFetch(endpoint, {
          method: "POST",
          side: "c",
          signal: controller?.signal,
          body: {
            user_id: userIdentifier, // 后端已忽略此字段，以 JWT 为准
            message: text,
            scenario,
            dev_override: devOverride ?? "",
          } as any,
        });

        if (!res.ok) {
          let errMsg = `请求失败 (${res.status})`;
          try {
            const errData = await res.json();
            errMsg = errData.detail || errMsg;
          } catch {}
          throw new Error(errMsg);
        }

        let replyText = "";
        let riskData: { level: string; score: number; tags: string[]; summary_for_admin: string } | null = null;

        // 两端统一走 SSE 流式：按场景选择消息列表 setter
        const setActiveMessages =
          scenario === "university" ? setUniversityMessages : setCommunityMessages;

        if (res.body) {
          // SSE 流式：边读边渲染
          const reader = res.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          let firstDelta = true;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // 按 SSE 事件边界拆分（\n\n）
            let idx;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
              const rawEvt = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const line = rawEvt.split("\n").find((l) => l.startsWith("data:"));
              if (!line) continue;
              const dataStr = line.slice(5).trim();
              if (!dataStr) continue;
              try {
                const evt = JSON.parse(dataStr);
                if (evt.type === "delta" && evt.content) {
                  // 第一个 delta 到达时清掉"正在输入..."，并取消总超时（流式已开始，允许继续接收）
                  if (firstDelta) {
                    replyText = evt.content;
                    firstDelta = false;
                    if (timeoutId !== null) {
                      window.clearTimeout(timeoutId);
                    }
                  } else {
                    replyText += evt.content;
                  }
                  const snapshot = replyText;
                  setActiveMessages((prev) =>
                    prev.map((m) => (m.id === loadingId ? { ...m, content: snapshot } : m))
                  );
                } else if (evt.type === "done") {
                  if (evt.reply) replyText = evt.reply;
                  riskData = evt.risk_assessment || null;
                } else if (evt.type === "error") {
                  throw new Error(evt.message || "流式响应出错");
                }
              } catch (e) {
                // 非 JSON 行忽略
              }
            }
          }

          const finalText = replyText;
          setActiveMessages((prev) =>
            prev.map((m) => (m.id === loadingId ? { ...m, content: finalText } : m))
          );
        } else {
          const data = await res.json();
          replyText = data.reply || "";
          riskData = data.risk_assessment || null;

          const updater = (prev: ChatMessage[]) =>
            prev.map((m) => (m.id === loadingId ? { ...m, content: replyText } : m));
          if (scenario === "university") {
            setUniversityMessages(updater);
          } else {
            setCommunityMessages(updater);
          }
        }

        // B：社区端回复落定后，后台预合成 TTS，用户点"朗读"时直接秒播
        if (scenario === "community") {
          prefetchTts(loadingId, replyText);
        }

        const now = new Date().toISOString();

        if (riskData && (riskData.level === "red" || riskData.level === "yellow")) {
          localStorage.setItem(
            "latest_ark_alert",
            JSON.stringify({
              eventId: hashCode(`${userIdentifier}::${now}`),
              ...riskData,
              scenario,
              timestamp: now,
              user_id: userIdentifier,
            })
          );
        } else if (riskData && riskData.level === "green") {
          localStorage.setItem(
            "latest_ark_green_event",
            JSON.stringify({
              eventId: hashCode(`green::${userIdentifier}::${now}`),
              ...riskData,
              scenario,
              timestamp: now,
              user_id: userIdentifier,
            })
          );
        }
      } catch (err: any) {
        const isTimeout =
          scenario === "community" && (controller?.signal.aborted || err?.name === "AbortError");
        if (isTimeout) {
          // 记录超时态，气泡会渲染为重试按钮
          setTimedOutMsgs((prev) => ({ ...prev, [loadingId]: text }));
          const updater = (prev: ChatMessage[]) =>
            prev.map((m) => (m.id === loadingId ? { ...m, content: "__TIMEOUT__" } : m));
          setCommunityMessages(updater);
        } else {
          const errMsg = "网络开小差了，请稍后再试试...";
          const updater = (prev: ChatMessage[]) =>
            prev.map((m) => (m.id === loadingId ? { ...m, content: errMsg } : m));
          if (scenario === "university") {
            setUniversityMessages(updater);
          } else {
            setCommunityMessages(updater);
          }
        }
      } finally {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        setIsLoading(false);
      }
    },
    [isLoading, scenario, prefetchTts]
  );

  // community 超时气泡 → 点击重试：移除旧气泡 + 重发
  const retryCommunityMessage = useCallback(
    (msgId: number) => {
      const text = timedOutMsgs[msgId];
      if (!text) return;
      setTimedOutMsgs((prev) => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
      setCommunityMessages((prev) => prev.filter((m) => m.id !== msgId));
      sendMessage(text);
    },
    [timedOutMsgs, sendMessage]
  );

  const handleAvatarClick = () => {
    const now = Date.now();
    if (now - lastClickTime < 600) {
      const next = avatarClickCount + 1;
      setAvatarClickCount(next);
      if (next >= 3) {
        setShowDevPanel((v) => !v);
        setAvatarClickCount(0);
      }
    } else {
      setAvatarClickCount(1);
    }
    setLastClickTime(now);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input.trim());
  };

  const handleDevAction = (type: string) => {
    if (type === "reset") {
      // 重置会换掉所有消息 id，旧的预合成音频缓存随之失效，统一清掉避免泄漏/错播
      stopSpeaking();
      try { ttsAbortRef.current?.abort(); } catch {}
      ttsCacheRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
      ttsCacheRef.current.clear();
      setSpeakingMsgId(null);
      setTtsLoadingMsgId(null);
      if (scenario === "university") {
        setUniversityMessages([
          { id: Date.now(), role: "assistant", content: "系统已重置，让我们重新开始吧！" },
        ]);
      } else {
        setCommunityMessages([
          { id: Date.now(), role: "assistant", content: "系统已重置，让我们重新开始吧！" },
        ]);
      }
      setShowDevPanel(false);
      return;
    }
    const text = DEV_MESSAGES[type as keyof typeof DEV_MESSAGES];
    if (text) sendMessage(text, type === "normal" ? undefined : type);
    setShowDevPanel(false);
  };

  // ── 全屏弹层 handlers ──────────────────────────────────────────
  const openGame = (game: "shredder" | "typing") => {
    setActiveGame(game);
    setMobileMenuOpen(false);
  };
  const closeGame = () => setActiveGame(null);

  // ── 打字发泄墙：每次输入生成飞字 ──────────────────────────────
  const FLYING_COLORS = ["#60a5fa","#34d399","#a78bfa","#f472b6","#fbbf24","#f87171","#38bdf8","#4ade80","#fb923c"];
  const handleTypingInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (!val) return;
    const container = typingContainerRef.current;
    const cw = container?.offsetWidth ?? 320;
    const ch = container?.offsetHeight ?? 160;
    const baseX = cw / 2;
    const baseY = ch / 2;
    const newChars: FlyingChar[] = val.split("").map((char) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 130;
      return {
        id: ++flyCharIdRef.current,
        char,
        x: baseX + (Math.random() - 0.5) * 80,
        y: baseY,
        vx: Math.cos(angle) * speed,
        vy: -(Math.abs(Math.sin(angle)) * speed + 60),
        color: FLYING_COLORS[Math.floor(Math.random() * FLYING_COLORS.length)],
        size: 16 + Math.floor(Math.random() * 26),
      };
    });
    setFlyingChars((prev) => [...prev, ...newChars]);
    const ids = newChars.map((c) => c.id);
    setTimeout(() => setFlyingChars((prev) => prev.filter((c) => !ids.includes(c.id))), 900);
    e.target.value = "";
  };

  const openTip = () => {
    setStressDialogOpen(true);
    setMobileMenuOpen(false);
  };

  // ── 能量电台播放逻辑（Refs 字典映射，移动端强兼容） ──
  const handleSongPlay = (songId: string) => {
    const allIds = ["medal", "lemon-tree", "piano"];

    // 1. 如果点击当前正在播放的，则暂停
    if (playingSong === songId) {
      const el = audioRefs.current[songId];
      if (el) el.pause();
      setPlayingSong(null);
      return;
    }

    // 2. 暂停其他所有歌曲
    allIds.forEach((id) => {
      if (id !== songId) {
        const el = audioRefs.current[id];
        if (el) el.pause();
      }
    });

    // 3. 播放新歌（从 Refs 字典直接提取）
    const targetEl = audioRefs.current[songId];
    if (!targetEl) {
      console.error(`Audio 元素 ${songId} 未在 refs 中注册！`);
      return;
    }
    try {
      const playPromise = targetEl.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setPlayingSong(songId);
        }).catch((error) => {
          console.error("浏览器拦截了自动播放:", error);
          setPlayingSong(null);
        });
      } else {
        setPlayingSong(songId);
      }
    } catch (error) {
      console.error("音频播放异常:", error);
      setPlayingSong(null);
    }
  };

  // ── 老友收音机播放逻辑（community） ──
  const handleRadioPlay = (radioId: string) => {
    const allIds = ["jingju", "pingshu", "health"];
    if (playingRadio === radioId) {
      const el = audioRefs.current[radioId];
      if (el) el.pause();
      setPlayingRadio(null);
      return;
    }
    allIds.forEach((id) => {
      if (id !== radioId) {
        const el = audioRefs.current[id];
        if (el) el.pause();
      }
    });
    const targetEl = audioRefs.current[radioId];
    if (!targetEl) return;
    try {
      const p = targetEl.play();
      if (p !== undefined) {
        p.then(() => setPlayingRadio(radioId)).catch((err) => {
          console.error("收音机播放被拦截:", err);
          toast({ title: "播放失败", description: "请先与页面交互后再点一次", duration: 2000 });
          setPlayingRadio(null);
        });
      } else {
        setPlayingRadio(radioId);
      }
    } catch (err) {
      console.error("收音机播放异常:", err);
      setPlayingRadio(null);
    }
  };

  // ── 正念放松站播放逻辑（Refs 字典映射，互斥切换，静默后台播放） ──
  const handleRelax = (type: string) => {
    // 1. 暂停其他所有放松音频
    ["rain", "wave", "forest", "meditation"].forEach((id) => {
      const audioEl = audioRefs.current[id];
      if (audioEl && id !== type) {
        audioEl.pause();
      }
    });

    // 2. 获取当前点击的音频
    const targetAudio = audioRefs.current[type];
    if (!targetAudio) return;

    // 3. 互斥切换与播放/暂停
    if (playingRelax === type) {
      targetAudio.pause();
      setPlayingRelax(null);
    } else {
      const playPromise = targetAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => console.error("放松音频播放被拦截:", e));
      }
      setPlayingRelax(type);
    }
  };

  // 清理音频 on unmount
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach((el) => el?.pause());
    };
  }, []);

  const isCampus = scenario === "university";
  // community 字号辅助：community 侧乘以 fontScale，university 保持原值
  const cFont = (campus: string, communityRem: number) =>
    isCampus ? campus : `${(communityRem * fontScale).toFixed(3)}rem`;

  const personaName = isCampus ? "知心学姐" : "社区小暖";
  const personaAvatarColor = isCampus ? "#f97316" : "#10b981";

  return (
    <div
      className={cn(
        "h-screen w-screen overflow-hidden flex",
        isCampus ? "theme-campus" : "theme-community"
      )}
    >
      {/* 左面板：PC 端显示，移动端隐藏 */}
      <div className="hidden lg:flex lg:w-72 xl:w-80 flex-shrink-0 flex-col">
        <LeftPanel playingSong={playingSong} handleSongPlay={handleSongPlay} playingRelax={playingRelax} onRelaxChange={setPlayingRelax} />
      </div>

      <main
        className="flex flex-col overflow-hidden min-w-0 flex-1 lg:max-w-2xl xl:max-w-3xl mx-auto shadow-2xl"
        style={{
          height: "100vh",
          background: isCampus ? "rgba(15,23,42,0.85)" : "#fff7ed",
        }}
      >
        <header
          className="flex items-center justify-between w-full px-3 sm:px-4 py-3 flex-shrink-0 z-20 gap-2"
          style={{
            background: isCampus ? "rgba(15,23,42,0.7)" : "#ffffff",
            borderBottom: `1px solid ${isCampus ? "rgba(6,182,212,0.12)" : "rgba(249,115,22,0.15)"}`,
          }}
        >
          {/* 移动端：左侧汉堡菜单入口 */}
          <div className="lg:hidden flex-shrink-0">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className={cn(
                    "flex items-center justify-center rounded-xl transition-all",
                    isCampus ? "w-9 h-9" : "h-11 px-3 gap-1.5"
                  )}
                  style={{
                    background: isCampus ? "rgba(6,182,212,0.15)" : "rgba(249,115,22,0.15)",
                    color: isCampus ? "#06b6d4" : "#c2410c",
                    border: isCampus ? "none" : "1px solid rgba(249,115,22,0.35)",
                  }}
                  title="打开功能菜单"
                >
                  <Menu className={isCampus ? "w-5 h-5" : "w-6 h-6"} />
                  {!isCampus && <span className="text-base font-semibold">菜单</span>}
                </button>
              </SheetTrigger>

              <SheetContent
                side="left"
                className="w-80 p-0 flex flex-col overflow-hidden"
                style={
                  isCampus
                    ? {
                        background: "rgba(15,23,42,0.97)",
                        backdropFilter: "blur(16px)",
                        borderColor: "rgba(6,182,212,0.2)",
                      }
                    : {
                        background: "#fff7ed",
                        borderColor: "rgba(249,115,22,0.3)",
                      }
                }
              >
                <div
                  className="px-4 py-3 flex-shrink-0"
                  style={{
                    borderBottom: `1px solid ${isCampus ? "rgba(6,182,212,0.12)" : "rgba(249,115,22,0.2)"}`,
                  }}
                >
                  <p
                    className="font-semibold"
                    style={{
                      color: isCampus ? "rgba(6,182,212,0.7)" : "#c2410c",
                      fontSize: cFont("0.75rem", 1),
                    }}
                  >
                    {scenario === "university" ? "🎓 功能与数据" : "🏡 日常关怀"}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {scenario === "university" ? (
                    <>
                      {/* 能量补给电台 */}
                      <div className="space-y-1">
                        <p className="text-xs font-bold flex items-center gap-1.5 mb-2" style={{ color: "#10b981" }}>
                          <span>🎧</span> 能量补给电台
                        </p>
                        {SONGS.map((song) => (
                          <button
                            key={song.id}
                            className="w-full text-left rounded-xl px-4 py-3 text-sm transition-all flex items-center gap-3"
                            style={{
                              background: playingSong === song.id ? "rgba(16,185,129,0.25)" : "rgba(16,185,129,0.12)",
                              border: `1px solid ${playingSong === song.id ? "rgba(16,185,129,0.5)" : "rgba(16,185,129,0.25)"}`,
                              color: playingSong === song.id ? "#fff" : "#6ee7b7",
                            }}
                            onClick={() => handleSongPlay(song.id)}
                          >
                            <span className="text-base flex-shrink-0">{playingSong === song.id ? "🔊" : song.cover}</span>
                            <span className="flex-1 truncate">{song.title}</span>
                            {playingSong === song.id && (
                              <span className="flex-shrink-0 text-xs" style={{ color: "#6ee7b7" }}>
                                ♪
                              </span>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* 正念放松站 */}
                      <div className="space-y-1">
                        <p className="text-xs font-bold flex items-center gap-1.5 mb-2" style={{ color: "#a855f7" }}>
                          <span>🧘</span> 正念放松站
                        </p>
                        {[
                          { label: "🌧️ 雨声", effect: "rain" as const },
                          { label: "🌊 海浪", effect: "wave" as const },
                          { label: "🍃 森林", effect: "forest" as const },
                          { label: "🧘 冥想", effect: "meditation" as const },
                        ].map(({ label, effect }) => (
                          <button
                            key={label}
                            className="w-full text-left rounded-xl px-4 py-2.5 text-sm transition-all"
                            style={{
                              background: playingRelax === effect ? "rgba(168,85,247,0.35)" : "rgba(168,85,247,0.1)",
                              border: `1px solid ${playingRelax === effect ? "rgba(168,85,247,0.65)" : "rgba(168,85,247,0.2)"}`,
                              color: playingRelax === effect ? "#fff" : "#d8b4fe",
                            }}
                            onClick={() => handleRelax(effect)}
                          >
                            {label} {playingRelax === effect && <span className="ml-1 opacity-70">♪</span>}
                          </button>
                        ))}
                      </div>

                      {/* 智伴解压锦囊 */}
                      <button
                        className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                        style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)", color: "#fb923c" }}
                        onClick={openTip}
                      >
                        📖 智伴解压锦囊 ✨
                      </button>

                      {/* 赛博解压游乐区 */}
                      <div className="space-y-1">
                        <p className="text-xs font-bold flex items-center gap-1.5 mb-2" style={{ color: "#10b981" }}>
                          <span>🎮</span> 赛博解压游乐区
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { icon: "💥", label: "情绪粉碎机", game: "shredder" as const },
                            { icon: "⌨️", label: "打字发泄墙", game: "typing" as const },
                          ].map(({ icon, label, game }) => (
                            <button
                              key={label}
                              className="rounded-xl py-3 text-sm font-medium flex flex-col items-center gap-1 transition-all"
                              style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#6ee7b7" }}
                              onClick={() => openGame(game)}
                            >
                              <span className="text-xl">{icon}</span>
                              <span>{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 每日治愈胶囊 */}
                      <div
                        className="rounded-xl p-4"
                        style={{
                          background: "rgba(30,41,59,0.5)",
                          border: "1px solid rgba(6,182,212,0.15)",
                        }}
                      >
                        <p className="text-xs font-bold mb-2" style={{ color: "#06b6d4" }}>
                          💊 每日治愈
                        </p>
                        <p className="text-sm leading-relaxed font-light" style={{ color: "#94a3b8" }}>
                          "允许一切发生。此刻的你，已经足够优秀了。"
                        </p>
                      </div>

                      {/* 24h 热线 */}
                      <a href="tel:400-161-9995" className="block no-underline">
                        <button
                          className="w-full rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 py-2.5"
                          style={{
                            background: "rgba(127,29,29,0.6)",
                            border: "1px solid rgba(220,38,38,0.4)",
                            color: "#fca5a5",
                          }}
                        >
                          📞 24h 心理援助热线
                        </button>
                      </a>
                    </>
                  ) : (
                    <>
                      {/* 一键呼救：置顶大按钮 */}
                      <div
                        className="rounded-2xl p-4"
                        style={{
                          background: "#fee2e2",
                          border: "2px solid #dc2626",
                        }}
                      >
                        <p className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: "#991b1b" }}>
                          <AlertCircle className="w-5 h-5" /> 紧急呼救
                        </p>
                        <div className="space-y-2">
                          {communityHotlines.map(({ label, phone }) => (
                            <a
                              key={phone}
                              href={`tel:${phone}`}
                              className="flex items-center justify-between rounded-xl px-4 py-3 no-underline"
                              style={{
                                background: phone === "120" ? "#dc2626" : "#ffffff",
                                color: phone === "120" ? "#ffffff" : "#991b1b",
                                border: phone === "120" ? "none" : "1px solid #fca5a5",
                              }}
                            >
                              <span className="font-bold text-base flex items-center gap-2">
                                <Phone className="w-5 h-5" />
                                {label}
                              </span>
                              <span className="font-mono text-base">{phone}</span>
                            </a>
                          ))}
                          {familyPhone ? (
                            <a
                              href={`tel:${familyPhone}`}
                              className="flex items-center justify-between rounded-xl px-4 py-3 no-underline"
                              style={{
                                background: "#ffffff",
                                color: "#991b1b",
                                border: "1px solid #fca5a5",
                              }}
                            >
                              <span className="font-bold text-base flex items-center gap-2">
                                <Phone className="w-5 h-5" />
                                家人电话
                              </span>
                              <span className="font-mono text-base">{familyPhone}</span>
                            </a>
                          ) : (
                            <button
                              onClick={() => {
                                const p = window.prompt("请输入家人电话（如：13800138000）");
                                if (p && /^[\d\-+ ]{3,20}$/.test(p.trim())) {
                                  saveFamilyPhone(p.trim());
                                  toast({ title: "已保存", description: "紧急时会优先拨打此号码", duration: 2000 });
                                } else if (p) {
                                  toast({ title: "号码格式不对", description: "请重新填写", variant: "destructive", duration: 2500 });
                                }
                              }}
                              className="w-full rounded-xl px-4 py-3 text-base font-semibold"
                              style={{
                                background: "#ffffff",
                                color: "#991b1b",
                                border: "1px dashed #fca5a5",
                              }}
                            >
                              + 设置家人电话
                            </button>
                          )}
                          {familyPhone && (
                            <button
                              onClick={() => {
                                if (confirm("清除已保存的家人电话？")) saveFamilyPhone("");
                              }}
                              className="text-xs"
                              style={{ color: "#991b1b", textDecoration: "underline" }}
                            >
                              清除家人电话
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 字号缩放 */}
                      <div
                        className="rounded-xl p-3 flex items-center justify-between"
                        style={{ background: "#ffffff", border: "1px solid rgba(249,115,22,0.25)" }}
                      >
                        <span className="text-base font-semibold" style={{ color: "#c2410c" }}>
                          🔠 字号大小
                        </span>
                        <div className="flex gap-1">
                          {[
                            { label: "小", v: 0.9 },
                            { label: "中", v: 1.15 },
                            { label: "大", v: 1.3 },
                            { label: "特大", v: 1.5 },
                          ].map((o) => {
                            const active = Math.abs(fontScale - o.v) < 0.01;
                            return (
                              <button
                                key={o.v}
                                onClick={() => setFontScalePersist(o.v)}
                                className="rounded-lg px-3 py-1.5 text-sm font-bold"
                                style={{
                                  background: active ? "#c2410c" : "#fff7ed",
                                  color: active ? "#ffffff" : "#c2410c",
                                  border: `1px solid ${active ? "#c2410c" : "#fed7aa"}`,
                                }}
                              >
                                {o.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 称呼偏好 */}
                      <div
                        className="rounded-xl p-3 flex items-center justify-between"
                        style={{ background: "#ffffff", border: "1px solid rgba(249,115,22,0.25)" }}
                      >
                        <span className="text-base font-semibold" style={{ color: "#c2410c" }}>
                          {honorific === "grandpa" ? "👴" : "👵"} 我想被称呼为
                        </span>
                        <div className="flex gap-1">
                          {[
                            { label: "爷爷", v: "grandpa" as const },
                            { label: "奶奶", v: "grandma" as const },
                          ].map((o) => {
                            const active = honorific === o.v;
                            return (
                              <button
                                key={o.v}
                                onClick={() => chooseHonorific(o.v)}
                                className="rounded-lg px-3 py-1.5 text-sm font-bold"
                                style={{
                                  background: active ? "#c2410c" : "#fff7ed",
                                  color: active ? "#ffffff" : "#c2410c",
                                  border: `1px solid ${active ? "#c2410c" : "#fed7aa"}`,
                                }}
                              >
                                {o.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 生活关怀 */}
                      <div
                        className="rounded-xl p-4"
                        style={{
                          background: "#ffffff",
                          border: "1px solid rgba(249,115,22,0.25)",
                        }}
                      >
                        <p className="text-sm font-bold mb-1" style={{ color: "#c2410c" }}>
                          🏡 生活关怀
                        </p>
                        <p className="text-xl font-bold" style={{ color: "#292524" }}>
                          ☀️ 今日天气 22°C 晴
                        </p>
                        <p
                          className="text-base mt-2 font-semibold"
                          style={{ color: "#c2410c" }}
                        >
                          💊 按时吃药，身体第一
                        </p>
                      </div>

                      {/* 贴心日程 */}
                      <div className="space-y-2">
                        <p
                          className="text-sm font-bold"
                          style={{ color: "#b45309" }}
                        >
                          ⏰ 贴心日程
                        </p>
                        {communityTips.map((t) => {
                          const key = `${t.time}-${t.text}`;
                          const done = !!tipsChecked[key];
                          return (
                            <button
                              key={key}
                              onClick={() =>
                                setTipsChecked((prev) => ({ ...prev, [key]: !prev[key] }))
                              }
                              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left"
                              style={{
                                background: done ? "#dcfce7" : "#ffffff",
                                border: `1px solid ${done ? "#86efac" : "rgba(249,115,22,0.25)"}`,
                              }}
                            >
                              <span className="text-2xl">{t.icon}</span>
                              <div className="flex-1">
                                <p
                                  className="text-base"
                                  style={{
                                    color: done ? "#166534" : "#292524",
                                    fontWeight: done ? 700 : 500,
                                    textDecoration: done ? "line-through" : "none",
                                  }}
                                >
                                  {t.text}
                                </p>
                                <p className="text-xs" style={{ color: "#78716c" }}>
                                  {t.time}
                                </p>
                              </div>
                              {done && <span className="text-green-600 text-xl">✓</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* 老友收音机 */}
                      <div>
                        <p
                          className="text-sm font-bold mb-2"
                          style={{ color: "#c2410c" }}
                        >
                          📻 老友收音机
                        </p>
                        {[
                          { id: "jingju", icon: "🎵", label: "经典京剧" },
                          { id: "pingshu", icon: "🎧", label: "单田芳评书" },
                          { id: "health", icon: "📻", label: "今日健康广播" },
                        ].map(({ id, icon, label }) => {
                          const active = playingRadio === id;
                          return (
                            <button
                              key={id}
                              onClick={() => handleRadioPlay(id)}
                              className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-base mb-1.5 transition-all active:scale-[0.98]"
                              style={{
                                background: active ? "#c2410c" : "#ffffff",
                                border: `1px solid ${active ? "#c2410c" : "rgba(249,115,22,0.25)"}`,
                                color: active ? "#ffffff" : "#292524",
                                fontSize: cFont("1rem", 1.125),
                              }}
                            >
                              <span className="flex items-center gap-2">
                                <span>{active ? "🔊" : icon}</span>
                                <span className="font-semibold">{label}</span>
                              </span>
                              <span className="text-xs font-bold" style={{ color: active ? "#ffffff" : "#c2410c" }}>
                                {active ? "■ 停止" : "▶ 播放"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <Avatar
            className="h-8 w-8 mr-3 cursor-pointer select-none flex-shrink-0"
            onClick={handleAvatarClick}
            title="连续点击3次呼出开发者工具"
          >
            {isCampus ? (
              <>
                <AvatarImage src="/ai-campus-avatar.png" alt="知心学姐" />
                <AvatarFallback
                  className="text-white text-sm flex items-center justify-center"
                  style={{ background: personaAvatarColor }}
                >
                  <Smile className="h-4 w-4" />
                </AvatarFallback>
              </>
            ) : (
              <>
                <AvatarImage src="/ai-community-avatar.png" alt="社区小暖" />
                <AvatarFallback
                  className="text-white text-sm flex items-center justify-center"
                  style={{ background: personaAvatarColor }}
                >
                  <Heart className="h-4 w-4" />
                </AvatarFallback>
              </>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <p
              className="font-bold leading-tight truncate"
              style={{
                color: isCampus ? "#f1f5f9" : "#292524",
                fontSize: cFont("1rem", 1.25),
              }}
            >
              {personaName}
            </p>
            <p
              className="text-xs"
              style={{ color: isCampus ? "#64748b" : "#a8a29e" }}
            >
              在线
            </p>
          </div>

            {scenario === "university" ? (
              <Badge
                variant="secondary"
                className="hidden sm:flex rounded-full px-3 py-1 text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 flex-shrink-0"
              >
                🎓 高校专属
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="hidden sm:flex rounded-full px-3 py-1 text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 flex-shrink-0"
              >
                🏡 社区专享
              </Badge>
            )}

          {/* 右侧：用户头像（个人中心） */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex-shrink-0 cursor-pointer"
            title="个人中心"
          >
            <Avatar className="h-8 w-8 ring-2 ring-cyan-500/30 group-hover:ring-cyan-400/50 transition-all">
              <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-bold text-sm">
                {(currentUser.displayName || "?").charAt(0)}
              </AvatarFallback>
            </Avatar>
          </button>
        </header>

        <ScrollArea
          className="flex-1 px-4 py-4 phone-chat"
          style={{
            background: isCampus ? "transparent" : "#fff7ed",
          }}
        >
          <div className="space-y-4 pb-2">
            {currentMessages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "assistant" ? (
                  <div className="flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Avatar className="h-7 w-7 mt-1 flex-shrink-0">
                      {isCampus ? (
                        <>
                          <AvatarImage src="/ai-campus-avatar.png" alt="知心学姐" />
                          <AvatarFallback
                            className="text-white text-xs flex items-center justify-center"
                            style={{ background: personaAvatarColor }}
                          >
                            <Smile className="h-3 w-3" />
                          </AvatarFallback>
                        </>
                      ) : (
                        <>
                          <AvatarImage src="/ai-community-avatar.png" alt="社区小暖" />
                          <AvatarFallback
                            className="text-white text-xs flex items-center justify-center"
                            style={{ background: personaAvatarColor }}
                          >
                            <Heart className="h-3 w-3" />
                          </AvatarFallback>
                        </>
                      )}
                    </Avatar>
                    <div
                      className="rounded-2xl rounded-tl-sm px-4 py-3 max-w-md"
                      style={{
                        background: isCampus ? "rgba(30,41,59,0.85)" : "#ffffff",
                        border: `1px solid ${isCampus ? "rgba(6,182,212,0.15)" : "rgba(249,115,22,0.15)"}`,
                        color: isCampus ? "#e2e8f0" : "#292524",
                        fontSize: cFont("0.875rem", 1.125),
                        lineHeight: "1.8",
                      }}
                    >
                      {!isCampus && msg.content === "__TIMEOUT__" ? (
                        <button
                          onClick={() => retryCommunityMessage(msg.id)}
                          className="flex items-center gap-2 text-base font-medium"
                          style={{ color: "#c2410c" }}
                        >
                          <RefreshCw className="w-5 h-5" />
                          网络有点慢，点我重试
                        </button>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                          </p>
                          {!isCampus && msg.content !== "正在输入..." && msg.content !== "__TIMEOUT__" && (
                            <button
                              onClick={() => speakMessage(msg.id, msg.content)}
                              className="mt-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                              style={{
                                background: speakingMsgId === msg.id ? "#c2410c" : "rgba(249,115,22,0.12)",
                                color: speakingMsgId === msg.id ? "#ffffff" : "#c2410c",
                                border: "1px solid rgba(249,115,22,0.3)",
                              }}
                              aria-label={
                                ttsLoadingMsgId === msg.id
                                  ? "取消合成"
                                  : speakingMsgId === msg.id
                                    ? "停止朗读"
                                    : "朗读"
                              }
                            >
                              {ttsLoadingMsgId === msg.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                              {ttsLoadingMsgId === msg.id
                                ? "合成中…"
                                : speakingMsgId === msg.id
                                  ? "停止"
                                  : "朗读"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-end gap-2">
                      <div
                        className="rounded-2xl rounded-br-sm px-4 py-3 max-w-md"
                        style={{
                          background: isCampus
                            ? "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
                            : "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                          color: "#ffffff",
                          fontSize: cFont("0.875rem", 1.125),
                          lineHeight: "1.8",
                        }}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>
                      </div>
                      <Avatar className="h-7 w-7 mb-1 flex-shrink-0">
                        <AvatarFallback
                          className="text-white text-xs flex items-center justify-center font-bold"
                          style={{
                            background: isCampus ? "#0891b2" : "#ea580c",
                          }}
                        >
                          {isCampus ? "👨" : honorific === "grandpa" ? "👴" : "👵"}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div
          className="px-4 pt-3 pb-1 flex-shrink-0"
          style={{
            background: isCampus ? "rgba(15,23,42,0.5)" : "#ffffff",
            borderTop: `1px solid ${isCampus ? "rgba(6,182,212,0.08)" : "rgba(249,115,22,0.1)"}`,
          }}
        >
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-3">
              {QUICK_ACTIONS[scenario].map((text) => (
                <Button
                  key={text}
                  variant="outline"
                  size="sm"
                  onClick={() => sendMessage(text)}
                  className="rounded-full flex-shrink-0"
                  style={{
                    borderColor: isCampus ? "rgba(6,182,212,0.25)" : "rgba(249,115,22,0.3)",
                    color: isCampus ? "#94a3b8" : "#57534e",
                    fontSize: cFont("0.75rem", 1),
                    background: isCampus ? "rgba(30,41,59,0.6)" : "rgba(249,115,22,0.06)",
                  }}
                >
                  {text}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <footer
          className="p-4 flex-shrink-0"
          style={{
            background: isCampus ? "rgba(15,23,42,0.6)" : "#ffffff",
            borderTop: `1px solid ${isCampus ? "rgba(6,182,212,0.1)" : "rgba(249,115,22,0.15)"}`,
          }}
        >
          <form onSubmit={handleSubmit} className="flex gap-2 items-center">
            {/* 左侧：community 模式切换按钮（微信风格） */}
            {!isCampus && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  // 切到语音模式时，收起键盘
                  if (!voiceMode && typeof document !== "undefined") {
                    (document.activeElement as HTMLElement | null)?.blur?.();
                  }
                  setVoiceMode((v) => !v);
                }}
                disabled={isLoading}
                aria-label={voiceMode ? "切换到键盘输入" : "切换到语音输入"}
                className="flex-shrink-0 px-3"
                style={{
                  background: "#ffffff",
                  color: "#c2410c",
                  border: "1px solid rgba(249,115,22,0.4)",
                }}
              >
                {voiceMode ? <Keyboard className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
            )}

            {/* 中间：文字输入框 或 按住说话按钮 */}
            {!isCampus && voiceMode ? (
              <button
                type="button"
                disabled={isLoading || transcribing}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  if (transcribing) return;
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                  startHoldRecord(e.clientY);
                }}
                onPointerMove={(e) => {
                  if (!holding) return;
                  // 上滑超过 60px 视为准备取消
                  const dy = holdStartYRef.current - e.clientY;
                  setHoldCancel(dy > 60);
                }}
                onPointerUp={(e) => {
                  if (!holding) return;
                  (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                  stopHoldRecord(holdCancel);
                }}
                onPointerCancel={() => {
                  if (holding) stopHoldRecord(true);
                }}
                className="flex-1 rounded-md select-none touch-none"
                style={{
                  height: "40px",
                  background: holding ? (holdCancel ? "#fecaca" : "#fed7aa") : "#fff7ed",
                  border: `1px solid ${holding ? "#c2410c" : "rgba(249,115,22,0.3)"}`,
                  color: holdCancel ? "#991b1b" : "#c2410c",
                  fontSize: cFont("0.9rem", 1.15),
                  fontWeight: 600,
                  WebkitUserSelect: "none",
                }}
              >
                {transcribing
                  ? "正在识别…"
                  : holding
                    ? (holdCancel ? "松开手指 取消发送" : "松开发送  上滑取消")
                    : "按住 说话"}
              </button>
            ) : (
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isCampus
                    ? "有什么心事，说给我听听..."
                    : "想聊什么就跟我说..."
                }
                className="flex-1"
                disabled={isLoading}
                style={{
                  background: isCampus ? "rgba(30,41,59,0.7)" : "#fff7ed",
                  borderColor: isCampus ? "rgba(6,182,212,0.2)" : "rgba(249,115,22,0.2)",
                  color: isCampus ? "#e2e8f0" : "#292524",
                  fontSize: cFont("0.875rem", 1.125),
                }}
              />
            )}

            {/* 右侧：发送按钮。语音模式下隐藏 */}
            {!(!isCampus && voiceMode) && (
              <Button
                type="submit"
                size="sm"
                disabled={isLoading || !input.trim()}
                className="text-white px-4 flex-shrink-0"
                style={{
                  background: isCampus
                    ? "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
                    : "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  fontSize: cFont("0.875rem", 1.125),
                }}
              >
                发送
              </Button>
            )}
          </form>

          {/* 按住说话时的悬浮提示气泡 */}
          {!isCampus && voiceMode && holding && (
            <div
              className="fixed left-1/2 -translate-x-1/2 bottom-28 z-50 rounded-2xl px-6 py-5 shadow-xl pointer-events-none"
              style={{
                background: holdCancel ? "#991b1b" : "#292524",
                color: "#ffffff",
                minWidth: "180px",
                textAlign: "center",
              }}
            >
              <div className="text-4xl mb-1">{holdCancel ? "✕" : "🎙"}</div>
              <div className="text-sm font-semibold">
                {holdCancel ? "松开手指 取消发送" : "正在聆听…"}
              </div>
              {!holdCancel && (
                <div className="text-xs mt-1 opacity-70">上滑取消</div>
              )}
            </div>
          )}
        </footer>

        {showDevPanel && (
          <div
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-slate-900 text-white p-4 rounded-t-xl z-50 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-sm">⚡</span>
                <span className="text-sm font-medium">开发者路演快捷注入器</span>
              </div>
              <button
                onClick={() => setShowDevPanel(false)}
                className="text-slate-400 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="justify-start text-sm"
                onClick={() => handleDevAction("normal")}
              >
                ▶ 正常聊天
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="justify-start text-sm text-amber-300"
                onClick={() => handleDevAction("yellow_alert")}
              >
                ⚠ 注入黄码（连续失眠）
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="justify-start text-sm text-red-400"
                onClick={() => handleDevAction("red_alert")}
              >
                🔥 注入红码（轻生倾向）
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="justify-start text-sm text-emerald-300"
                onClick={() => handleDevAction("green")}
              >
                💚 注入绿码（情绪平稳）
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="justify-start text-sm"
                onClick={() => handleDevAction("reset")}
              >
                🔄 重置系统状态
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* 右面板：PC 端显示，移动端隐藏 */}
      <div className="hidden lg:flex lg:w-72 xl:w-80 flex-shrink-0 flex-col">
        <RightPanel />
      </div>

      {/* ── 个人中心抽屉（独立 Portal，脱离 SheetContent 嵌套） ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-[360px] sm:w-[400px] p-0"
          style={{
            background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
            borderColor: "#334155",
          }}
        >
          <SheetHeader className="p-6 pb-4" style={{ borderBottom: "1px solid #334155" }}>
            <SheetTitle
              className="text-lg font-bold text-slate-100"
              style={{ color: "#f1f5f9" }}
            >
              账户基本信息
            </SheetTitle>
          </SheetHeader>

          <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-cyan-500/30">
                <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-xl font-bold">
                  {(currentUser.displayName || "?").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xl font-bold text-slate-100" style={{ color: "#f1f5f9" }}>
                  {currentUser.displayName || "未登录用户"}
                </p>
                <p className="text-sm text-slate-400">
                  {currentUser.role === "student" ? "已认证学生用户" : "已认证社会用户"}
                </p>
              </div>
            </div>

            <Separator style={{ background: "#334155" }} />

            <Card
              className="border-slate-700"
              style={{ background: "rgba(30,41,59,0.5)", borderColor: "#334155" }}
            >
              <CardContent className="p-4 space-y-4">
                {currentUser.role === "student" ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ background: "rgba(6,182,212,0.15)" }}>
                        <Building2 className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 mb-0.5">所属学校</p>
                        <p className="text-sm font-medium text-slate-200">
                          {"school" in currentUser ? (currentUser.school || "-") : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ background: "rgba(139,92,246,0.15)" }}>
                        <GraduationCap className="h-4 w-4 text-purple-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 mb-0.5">当前学历</p>
                        <Badge
                          variant="secondary"
                          className="text-xs font-medium"
                          style={{
                            background: "rgba(139,92,246,0.2)",
                            color: "#c4b5fd",
                            borderColor: "rgba(139,92,246,0.3)",
                          }}
                        >
                          {"degree" in currentUser ? (currentUser.degree || "-") : "-"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ background: "rgba(34,197,94,0.15)" }}>
                        <Hash className="h-4 w-4 text-green-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 mb-0.5">学号</p>
                        <p className="text-sm font-medium text-slate-200">
                          {"studentId" in currentUser ? (currentUser.studentId || "-") : "-"}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ background: "rgba(249,115,22,0.15)" }}>
                        <span className="text-base">🏷️</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 mb-0.5">账号类型</p>
                        <Badge
                          variant="secondary"
                          className="text-xs font-medium"
                          style={{
                            background: "rgba(249,115,22,0.2)",
                            color: "#fdba74",
                            borderColor: "rgba(249,115,22,0.3)",
                          }}
                        >
                          社会用户
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ background: "rgba(6,182,212,0.15)" }}>
                        <Hash className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 mb-0.5">绑定手机</p>
                        <p className="text-sm font-medium text-slate-200">
                          {(currentUser as SocialUser).phone || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ background: "rgba(168,85,247,0.15)" }}>
                        <span className="text-base">📧</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 mb-0.5">绑定邮箱</p>
                        <p className="text-sm font-medium text-slate-200">
                          {(currentUser as SocialUser).email || "暂未绑定"}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Separator style={{ background: "#334155" }} />

            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-slate-300"
                style={{ borderColor: "#475569", background: "transparent" }}
                onClick={() => {
                  toast({ title: "功能开发中", description: "修改密码功能正在开发中...", variant: "default", duration: 3000 });
                }}
              >
                <Lock className="h-4 w-4" />
                修改密码
              </Button>
              <Button
                variant="destructive"
                className="w-full justify-start gap-2"
                onClick={async () => {
                  if (confirm("确定要退出登录吗？")) {
                    try {
                      await apiFetch("/api/auth/c-logout", { method: "POST", side: "c", autoRedirectOn401: false });
                    } catch {}
                    clearToken("c");
                    localStorage.removeItem("ark_scenario");
                    localStorage.removeItem("latest_ark_alert");
                    localStorage.removeItem("latest_ark_green_event");
                    localStorage.removeItem("currentUser");
                    window.location.href = "/login";
                  }
                }}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── 全屏赛博解压游戏浮层 ── */}
      {activeGame && (
        <>
          {/* 飞字 CSS 动画 */}
          <style>{`
            @keyframes ark-fly {
              0%   { transform: translate(0,0) scale(1);   opacity: 1; }
              100% { transform: translate(var(--vx),var(--vy)) scale(0.15); opacity: 0; }
            }
          `}</style>
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
            style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}
          >
            <button
              onClick={closeGame}
              className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl font-light transition-colors"
            >
              ×
            </button>

            {/* ── 情绪粉碎机 ── */}
            {activeGame === "shredder" && <EmotionShredder />}

            {/* ── 打字发泄墙 ── */}
            {activeGame === "typing" && (
              <div className="flex flex-col items-center gap-4 w-80">
                {/* 提示文案 */}
                <div className="text-center">
                  <p className="text-white/70 text-sm">有什么话，打出来</p>
                  <p className="text-white/30 text-xs mt-1">骂几句也没关系 🤫 没人看到</p>
                </div>

                {/* 飞字容器 + 输入框 */}
                <div
                  ref={typingContainerRef}
                  className="relative w-full"
                  style={{ height: 160 }}
                >
                  {/* 飞字层 */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                    {flyingChars.map((c) => (
                      <span
                        key={c.id}
                        className="absolute font-bold pointer-events-none"
                        style={{
                          left: c.x,
                          top: c.y,
                          color: c.color,
                          fontSize: c.size,
                          lineHeight: 1,
                          ["--vx" as string]: `${c.vx}px`,
                          ["--vy" as string]: `${c.vy}px`,
                          animation: "ark-fly 0.85s ease-out forwards",
                        }}
                      >
                        {c.char}
                      </span>
                    ))}
                  </div>

                  {/* 输入框 */}
                  <textarea
                    className="absolute inset-0 w-full h-full rounded-2xl p-4 text-base text-white placeholder-white/25 resize-none focus:outline-none"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                    }}
                    placeholder="随便写，写完自动消失..."
                    autoFocus
                    onChange={handleTypingInput}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── community 专属：右下角紧急呼救 FAB ── */}
      {!isCampus && (
        <button
          onClick={() => setSosOpen(true)}
          className="fixed right-4 bottom-28 z-40 flex items-center gap-2 rounded-full px-5 py-4 shadow-lg"
          style={{
            background: "#dc2626",
            color: "#ffffff",
            boxShadow: "0 8px 24px rgba(220,38,38,0.45)",
          }}
          title="紧急呼救"
          aria-label="紧急呼救"
        >
          <Phone className="w-6 h-6" />
          <span className="text-base font-bold">呼救</span>
        </button>
      )}

      {/* ── community 专属：紧急呼救对话框 ── */}
      <Dialog open={sosOpen} onOpenChange={setSosOpen}>
        <DialogContent
          className="max-w-sm w-[calc(100vw-32px)] p-0 overflow-hidden"
          style={{ background: "#fff7ed", borderColor: "#fca5a5" }}
        >
          <DialogHeader className="px-6 pt-5 pb-3" style={{ borderBottom: "1px solid #fecaca" }}>
            <DialogTitle className="flex items-center gap-2 text-base font-bold" style={{ color: "#991b1b" }}>
              <AlertCircle className="w-5 h-5" /> 紧急呼救
            </DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            {communityHotlines.map(({ label, phone }) => (
              <a
                key={phone}
                href={`tel:${phone}`}
                className="flex items-center justify-between rounded-xl px-4 py-4 no-underline"
                style={{
                  background: phone === "120" ? "#dc2626" : "#ffffff",
                  color: phone === "120" ? "#ffffff" : "#991b1b",
                  border: phone === "120" ? "none" : "1px solid #fca5a5",
                }}
              >
                <span className="font-bold text-lg flex items-center gap-2">
                  <Phone className="w-5 h-5" />
                  {label}
                </span>
                <span className="font-mono text-lg">{phone}</span>
              </a>
            ))}
            {familyPhone ? (
              <a
                href={`tel:${familyPhone}`}
                className="flex items-center justify-between rounded-xl px-4 py-4 no-underline"
                style={{ background: "#ffffff", color: "#991b1b", border: "1px solid #fca5a5" }}
              >
                <span className="font-bold text-lg flex items-center gap-2">
                  <Phone className="w-5 h-5" />
                  家人电话
                </span>
                <span className="font-mono text-lg">{familyPhone}</span>
              </a>
            ) : (
              <button
                onClick={() => {
                  const p = window.prompt("请输入家人电话（如：13800138000）");
                  if (p && /^[\d\-+ ]{3,20}$/.test(p.trim())) {
                    saveFamilyPhone(p.trim());
                    toast({ title: "已保存", description: "紧急时会优先拨打此号码", duration: 2000 });
                  } else if (p) {
                    toast({ title: "号码格式不对", description: "请重新填写", variant: "destructive", duration: 2500 });
                  }
                }}
                className="w-full rounded-xl px-4 py-4 text-base font-semibold"
                style={{ background: "#ffffff", color: "#991b1b", border: "1px dashed #fca5a5" }}
              >
                + 设置家人电话
              </button>
            )}
            <p className="text-xs text-center pt-2" style={{ color: "#78716c" }}>
              点击号码即可直接拨打
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 称呼选择弹窗（community 首次进入） ── */}
      <Dialog open={honorificDialogOpen} onOpenChange={setHonorificDialogOpen}>
        <DialogContent
          className="max-w-sm w-[calc(100vw-32px)] p-0 overflow-hidden"
          style={{ background: "#fff7ed", borderColor: "#fdba74" }}
        >
          <DialogHeader className="px-6 pt-5 pb-2" style={{ borderBottom: "1px solid #fed7aa" }}>
            <DialogTitle className="text-base font-bold" style={{ color: "#9a3412" }}>
              请问我该怎么称呼您？
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-3">
            <p className="text-sm" style={{ color: "#78716c" }}>
              选好之后，我会一直这样喊您～
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => chooseHonorific("grandpa")}
                className="flex flex-col items-center gap-2 rounded-2xl py-5 transition-all active:scale-95"
                style={{ background: "#ffffff", border: "2px solid #fdba74", color: "#9a3412" }}
              >
                <span className="text-5xl">👴</span>
                <span className="text-lg font-bold">叫我爷爷</span>
              </button>
              <button
                onClick={() => chooseHonorific("grandma")}
                className="flex flex-col items-center gap-2 rounded-2xl py-5 transition-all active:scale-95"
                style={{ background: "#ffffff", border: "2px solid #fdba74", color: "#9a3412" }}
              >
                <span className="text-5xl">👵</span>
                <span className="text-lg font-bold">叫我奶奶</span>
              </button>
            </div>
            <p className="text-xs text-center pt-1" style={{ color: "#a8a29e" }}>
              之后可以在侧边栏修改
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 解压锦囊弹窗（根层，PC/移动端共用） ── */}
      <Dialog open={stressDialogOpen} onOpenChange={setStressDialogOpen}>
        <DialogContent
          className="max-w-md w-[calc(100vw-32px)] max-h-[80vh] overflow-hidden flex flex-col p-0"
          style={{ background: "linear-gradient(180deg,#1e293b,#0f172a)", borderColor: "rgba(6,182,212,0.25)" }}
        >
          <DialogHeader className="px-6 pt-5 pb-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(6,182,212,0.12)" }}>
            <DialogTitle className="text-cyan-400 text-base font-bold flex items-center gap-2">
              📖 智伴解压锦囊
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-5">
            <Tabs defaultValue="breathing" className="w-full mt-4">
              <TabsList className="w-full grid grid-cols-4 h-8 rounded-xl" style={{ background: "rgba(6,182,212,0.08)" }}>
                {STRESS_RELIEF_DATA.map((cat) => (
                  <TabsTrigger
                    key={cat.id}
                    value={cat.id}
                    className="text-xs rounded-lg h-7 flex items-center justify-center gap-1"
                    style={{ color: "#64748b" }}
                  >
                    <span className="text-sm">{cat.icon}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {STRESS_RELIEF_DATA.map((cat) => (
                <TabsContent key={cat.id} value={cat.id} className="mt-4 space-y-2">
                  {cat.tips.map((tip, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl px-4 py-3"
                      style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)" }}
                    >
                      <span className="text-cyan-400 font-bold text-sm flex-shrink-0 mt-0.5">{i + 1}.</span>
                      <p className="text-slate-300 text-sm leading-relaxed">{tip}</p>
                    </div>
                  ))}
                  <div className="pt-2 space-y-1.5">
                    <p className="text-xs text-slate-500 font-medium">推荐外链</p>
                    {cat.id === "breathing" && (
                      <a href="https://www.headspace.com/meditation/breathing-exercises" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors underline">
                        <Volume2 className="h-3 w-3" /> Headspace 呼吸练习
                      </a>
                    )}
                    {cat.id === "movement" && (
                      <a href="https://www.bilibili.com/video/BV1WZ4y1F7eF" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors underline">
                        <Music className="h-3 w-3" /> 5分钟肩颈放松跟练
                      </a>
                    )}
                    {cat.id === "emotion" && (
                      <a href="https://www.gratitudelogjournal.com/" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors underline">
                        <Volume2 className="h-3 w-3" /> 在线情绪日记工具
                      </a>
                    )}
                    {cat.id === "life" && (
                      <a href="https://www.ximalaya.com/" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors underline">
                        <Music className="h-3 w-3" /> 喜马拉雅 — 助眠·放松·治愈
                      </a>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 全局隐藏音频节点（能量电台 + 正念放松站，Callback Refs 注册到字典） ── */}
      {/* 能量电台 */}
      <audio ref={(el) => { audioRefs.current["medal"] = el; }} src="/sounds/medal.mp3" className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto"
        onEnded={() => { const el = audioRefs.current["medal"]; if (el) { el.currentTime = 0; setPlayingSong(null); } }} />
      <audio ref={(el) => { audioRefs.current["lemon-tree"] = el; }} src="/sounds/lemon-tree.mp3" className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto"
        onEnded={() => { const el = audioRefs.current["lemon-tree"]; if (el) { el.currentTime = 0; setPlayingSong(null); } }} />
      <audio ref={(el) => { audioRefs.current["piano"] = el; }} src="/sounds/piano.mp3" className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto"
        onEnded={() => { const el = audioRefs.current["piano"]; if (el) { el.currentTime = 0; setPlayingSong(null); } }} />
      {/* 老友收音机音频预挂载 */}
      <audio ref={(el) => { audioRefs.current["jingju"] = el; }} src="/sounds/jingju.mp3" className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto"
        onEnded={() => { const el = audioRefs.current["jingju"]; if (el) { el.currentTime = 0; setPlayingRadio(null); } }} />
      <audio ref={(el) => { audioRefs.current["pingshu"] = el; }} src="/sounds/pingshu.mp3" className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto"
        onEnded={() => { const el = audioRefs.current["pingshu"]; if (el) { el.currentTime = 0; setPlayingRadio(null); } }} />
      <audio ref={(el) => { audioRefs.current["health"] = el; }} src="/sounds/health.mp3" className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto"
        onEnded={() => { const el = audioRefs.current["health"]; if (el) { el.currentTime = 0; setPlayingRadio(null); } }} />
      {/* 正念放松站音频预挂载 */}
      <audio ref={(el) => { audioRefs.current["rain"] = el; }} src="/sounds/rain.mp3" loop className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto" />
      <audio ref={(el) => { audioRefs.current["wave"] = el; }} src="/sounds/wave.mp3" loop className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto" />
      <audio ref={(el) => { audioRefs.current["forest"] = el; }} src="/sounds/forest.mp3" loop className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto" />
      <audio ref={(el) => { audioRefs.current["meditation"] = el; }} src="/sounds/meditation.mp3" className="absolute w-0 h-0 opacity-0 pointer-events-none" preload="auto"
        onEnded={() => setPlayingRelax(null)} />
    </div>
  );
}
