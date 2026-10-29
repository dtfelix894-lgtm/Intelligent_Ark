"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE, getToken } from "@/lib/api";
import type { RiskAlert } from "./types";

export type AlertStreamStatus = "idle" | "connecting" | "live" | "fallback";

type StreamHandlers = {
  onAlertCreated: (item: RiskAlert) => void;
  /** 连接成功（含收到 ready） */
  onLive?: () => void;
  /** 断开或失败，应回退轮询 */
  onFallback?: () => void;
};

type StreamPayload = {
  type?: string;
  item?: RiskAlert;
  ts?: string;
  scenario?: string;
};

function streamUrl() {
  const base = API_BASE.replace(/\/$/, "");
  const path = "/api/admin/alerts/stream?scenario=university";
  return base ? `${base}${path}` : path;
}

/**
 * 订阅 GET /api/admin/alerts/stream（SSE）。
 * - 同域：credentials include → b_token Cookie
 * - 跨域配置了 API_BASE：附带 Authorization Bearer（与 apiFetch 一致）
 * 原生 EventSource 无法带 Bearer，故用 fetch + ReadableStream。
 */
export function useAdminAlertsStream(
  enabled: boolean,
  { onAlertCreated, onLive, onFallback }: StreamHandlers,
) {
  const [status, setStatus] = useState<AlertStreamStatus>("idle");
  const handlersRef = useRef({ onAlertCreated, onLive, onFallback });
  handlersRef.current = { onAlertCreated, onLive, onFallback };
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef(0);
  const liveRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      abortRef.current = null;
      liveRef.current = false;
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;

    const markFallback = () => {
      liveRef.current = false;
      setStatus("fallback");
      handlersRef.current.onFallback?.();
    };

    const connect = async () => {
      if (cancelled) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus(liveRef.current ? "live" : "connecting");

      try {
        const headers: Record<string, string> = {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        };
        // 跨域时与 apiFetch 一致补 Bearer；同源依赖 Cookie
        if (API_BASE) {
          const token = getToken("b");
          if (token) headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(streamUrl(), {
          method: "GET",
          credentials: "include",
          headers,
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let eventName = "message";

        retryRef.current = 0;

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE 事件以空行分隔
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() || "";

          for (const block of parts) {
            if (!block.trim()) continue;
            let dataLines: string[] = [];
            eventName = "message";
            for (const rawLine of block.split(/\r?\n/)) {
              const line = rawLine.replace(/\r$/, "");
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trimStart());
              } else if (line.startsWith(":")) {
                // comment / keep-alive
              }
            }
            if (dataLines.length === 0) continue;
            let payload: StreamPayload = {};
            try {
              payload = JSON.parse(dataLines.join("\n")) as StreamPayload;
            } catch {
              continue;
            }

            if (eventName === "ready" || payload.type === "ready") {
              liveRef.current = true;
              setStatus("live");
              handlersRef.current.onLive?.();
              continue;
            }
            if (eventName === "heartbeat" || payload.type === "heartbeat") {
              // 心跳：保持 live
              if (!liveRef.current) {
                liveRef.current = true;
                setStatus("live");
                handlersRef.current.onLive?.();
              }
              continue;
            }

            // 后端 yield event: alert，body.type === alert_created
            const isCreated =
              payload.type === "alert_created" ||
              eventName === "alert" ||
              eventName === "alert_created";
            if (isCreated && payload.item && typeof payload.item.id === "number") {
              if (!liveRef.current) {
                liveRef.current = true;
                setStatus("live");
                handlersRef.current.onLive?.();
              }
              handlersRef.current.onAlertCreated(payload.item);
            }
          }
        }

        if (!cancelled) {
          markFallback();
          scheduleRetry();
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        markFallback();
        scheduleRetry();
      }
    };

    const scheduleRetry = () => {
      if (cancelled) return;
      const attempt = Math.min(retryRef.current + 1, 6);
      retryRef.current = attempt;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
      retryTimer = window.setTimeout(() => {
        void connect();
      }, delay);
    };

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
      abortRef.current?.abort();
      abortRef.current = null;
      liveRef.current = false;
    };
  }, [enabled]);

  return status;
}