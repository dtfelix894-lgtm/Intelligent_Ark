"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { apiJson } from "@/lib/api";

const MAX_RECORDING_SECONDS = 30;

type RecorderState = "idle" | "requesting" | "recording" | "transcribing";
export type VoiceFeedback = { kind: "info" | "success" | "error"; message: string };
type Props = {
  disabled: boolean;
  onTranscript: (text: string) => void;
  onFeedback: (feedback: VoiceFeedback | null) => void;
};

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, length * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

export function VoiceInput({ disabled, onTranscript, onFeedback }: Props) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const recordingRef = useRef(false);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const transcriptionRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef({ onTranscript, onFeedback });

  useEffect(() => { callbacksRef.current = { onTranscript, onFeedback }; }, [onTranscript, onFeedback]);

  const releaseRecorder = useCallback(() => {
    recordingRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    gainRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (contextRef.current && contextRef.current.state !== "closed") {
      void contextRef.current.close().catch(() => undefined);
    }
    processorRef.current = null;
    sourceRef.current = null;
    gainRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      transcriptionRef.current?.abort();
      releaseRecorder();
    };
  }, [releaseRecorder]);

  async function finishRecording() {
    if (!recordingRef.current) return;
    const chunks = chunksRef.current;
    const sampleRate = sampleRateRef.current;
    releaseRecorder();

    const recordedSeconds = (Date.now() - startedAtRef.current) / 1000;
    if (!chunks.length || recordedSeconds < 1) {
      setState("idle");
      setSeconds(0);
      onFeedback({ kind: "error", message: "录音时间太短，请至少说 1 秒后再停止。" });
      return;
    }

    setState("transcribing");
    onFeedback({ kind: "info", message: "正在识别语音，请稍候…" });
    const controller = new AbortController();
    transcriptionRef.current = controller;
    try {
      const form = new FormData();
      form.append("file", encodeWav(chunks, sampleRate), "voice-input.wav");
      const result = await apiJson<{ text: string }>("/api/asr/transcribe", {
        method: "POST",
        side: "c",
        timeoutMs: 45000,
        body: form,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      if (!result.text.trim()) throw new Error("没有识别到清晰语音，请重试");
      callbacksRef.current.onTranscript(result.text.trim());
      callbacksRef.current.onFeedback({ kind: "success", message: "语音已转成文字，请确认后发送。" });
    } catch (reason) {
      if (mountedRef.current) {
        callbacksRef.current.onFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "语音识别失败，请重试。" });
      }
    } finally {
      if (transcriptionRef.current === controller) transcriptionRef.current = null;
      if (mountedRef.current) {
        setState("idle");
        setSeconds(0);
      }
    }
  }

  async function startRecording() {
    if (disabled || state !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      onFeedback({ kind: "error", message: "当前浏览器不支持录音，请使用新版 Chrome、Edge 或 Safari。" });
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      onFeedback({ kind: "error", message: "请在安全连接（https）下使用语音输入。" });
      return;
    }

    setState("requesting");
    onFeedback({ kind: "info", message: "正在请求麦克风权限…" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextClass();
      contextRef.current = context;
      await context.resume();
      if (!mountedRef.current) {
        releaseRecorder();
        return;
      }
      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      const gain = context.createGain();
      gainRef.current = gain;
      gain.gain.value = 0;
      chunksRef.current = [];
      sampleRateRef.current = context.sampleRate;
      processor.onaudioprocess = (event) => {
        chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      recordingRef.current = true;
      setSeconds(0);
      setState("recording");
      onFeedback({ kind: "info", message: `正在录音 0:${String(MAX_RECORDING_SECONDS).padStart(2, "0")}，点击停止后开始识别。` });
      const startedAt = Date.now();
      startedAtRef.current = startedAt;
      intervalRef.current = setInterval(() => {
        const elapsed = Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
        setSeconds(elapsed);
        onFeedback({ kind: "info", message: `正在录音 0:${String(elapsed).padStart(2, "0")} / 0:${MAX_RECORDING_SECONDS}，点击停止后开始识别。` });
      }, 250);
      timeoutRef.current = setTimeout(() => {
        void finishRecording();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (reason) {
      releaseRecorder();
      if (!mountedRef.current) return;
      setState("idle");
      setSeconds(0);
      const denied = reason instanceof DOMException && (reason.name === "NotAllowedError" || reason.name === "SecurityError");
      onFeedback({ kind: "error", message: denied ? "麦克风权限未开启，请在浏览器地址栏中允许后重试。" : "无法启动麦克风，请检查设备后重试。" });
    }
  }

  const isLoading = state === "requesting" || state === "transcribing";
  const label = state === "recording" ? `停止录音，已录制 ${seconds} 秒` : isLoading ? "正在处理语音" : "开始语音输入";

  return (
    <button
      type="button"
      onClick={state === "recording" ? finishRecording : startRecording}
      disabled={(disabled && state !== "recording") || isLoading}
      aria-label={label}
      aria-pressed={state === "recording"}
      title={label}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${state === "recording" ? "border-red-300 bg-red-50 text-red-700 motion-safe:animate-pulse" : "border-border bg-secondary text-primary hover:bg-violet-100"}`}
    >
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : state === "recording" ? <Square className="h-4 w-4 fill-current" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
