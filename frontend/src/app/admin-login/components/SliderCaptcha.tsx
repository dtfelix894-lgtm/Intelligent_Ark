"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SliderCaptchaProps {
  onVerified: (verified: boolean) => void;
}

export default function SliderCaptcha({ onVerified }: SliderCaptchaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);

  const TRACK_WIDTH = 300;
  const HANDLE_WIDTH = 48;
  const GAP = 6;
  const THRESHOLD = TRACK_WIDTH - HANDLE_WIDTH - GAP;

  const handleSuccess = useCallback(() => {
    setIsSuccess(true);
    setIsError(false);
    setTimeout(() => onVerified(true), 400);
  }, [onVerified]);

  const handleReset = () => {
    setOffsetX(0);
    setIsSuccess(false);
    setIsError(false);
    setIsDragging(false);
    onVerified(false);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const track = document.getElementById("captcha-track");
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const startX = rect.left;
      const delta = e.clientX - startX - HANDLE_WIDTH / 2;
      const newOffset = Math.max(GAP, Math.min(delta, THRESHOLD));
      setOffsetX(newOffset);
      if (newOffset >= THRESHOLD - 3) {
        setIsDragging(false);
        handleSuccess();
      }
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      if (!isSuccess && offsetX < THRESHOLD - 3) {
        setIsError(true);
        setTimeout(() => {
          setOffsetX(0);
          setIsError(false);
        }, 600);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isSuccess, offsetX, handleSuccess]);

  const handleMouseDown = () => {
    if (isSuccess) return;
    setIsDragging(true);
  };

  const fillInstantly = () => {
    setOffsetX(THRESHOLD);
    setIsSuccess(true);
    setIsError(false);
    setTimeout(() => onVerified(true), 400);
  };

  return (
    <div className="space-y-2">
      {/* Track */}
      <div
        id="captcha-track"
        className={cn(
          "relative rounded-lg overflow-hidden select-none border transition-colors",
          isSuccess
            ? "border-emerald-400/50"
            : isError
            ? "border-red-400"
            : "border-slate-300"
        )}
        style={{ height: 44, userSelect: "none" }}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-50 to-slate-100" />

        {/* Slot gap (visual hole) */}
        <div
          className="absolute top-0 bottom-0 bg-white/90 border-l border-r border-dashed border-slate-300 flex items-center justify-center"
          style={{ left: THRESHOLD, width: HANDLE_WIDTH }}
        >
          <div className="w-5 h-5 bg-slate-200 rounded-full" />
        </div>

        {/* Success overlay */}
        {isSuccess && (
          <div className="absolute inset-0 bg-emerald-50/80 flex items-center justify-center">
            <span className="text-xs font-medium text-emerald-600">验证通过</span>
          </div>
        )}

        {/* Sliding handle */}
        <div
          className={cn(
            "absolute top-0 bottom-0 flex items-center justify-center cursor-grab active:cursor-grabbing select-none transition-shadow",
            isSuccess
              ? "bg-emerald-500 cursor-default shadow-emerald-200"
              : isError
              ? "bg-red-400"
              : "bg-white border border-slate-200 shadow-sm hover:shadow-md",
            isDragging && "shadow-lg shadow-blue-200 scale-[1.02]"
          )}
          style={{
            left: offsetX,
            width: HANDLE_WIDTH,
          }}
          onMouseDown={handleMouseDown}
        >
          {isSuccess ? (
            <Check className="w-5 h-5 text-white" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-slate-400">
              <path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-slate-400">
          {isSuccess ? (
            <span className="text-emerald-500 flex items-center gap-1">
              <Check className="w-3 h-3" /> 验证通过
            </span>
          ) : (
            "按住滑块拖拽至最右侧完成验证"
          )}
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          重试
        </button>
      </div>

      {/* Demo shortcut */}
      {!isSuccess && (
        <button
          type="button"
          onClick={fillInstantly}
          className="w-full text-center text-[10px] text-slate-400 hover:text-slate-600 underline decoration-dashed underline-offset-2 transition-colors"
        >
          [演示] 一键通过验证
        </button>
      )}
    </div>
  );
}
