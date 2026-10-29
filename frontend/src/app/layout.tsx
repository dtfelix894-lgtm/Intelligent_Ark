import type { Metadata } from "next";
import "./globals.css";
import { ScenarioProvider } from "@/lib/scenario-context";
import { ToastProvider } from "@/lib/use-toast";

export const metadata: Metadata = {
  title: "智伴方舟 · 高校心理支持",
  description: "面向高校学生的 AI 心理陪伴与自助减压平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body className="min-h-screen">
        <a href="#main-content" className="ark-skip-link">跳到主要内容</a>
        <ScenarioProvider>
          <ToastProvider>{children}</ToastProvider>
        </ScenarioProvider>
      </body>
    </html>
  );
}
