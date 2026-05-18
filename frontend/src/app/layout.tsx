import type { Metadata } from "next";
import "./globals.css";
import { ScenarioProvider } from "@/lib/scenario-context";
import { ToastProvider } from "@/lib/use-toast";

export const metadata: Metadata = {
  title: "✨ 智伴方舟 · 智能陪伴",
  description: "您的专属情绪治理与生活陪伴助手",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <ScenarioProvider>
          <ToastProvider>{children}</ToastProvider>
        </ScenarioProvider>
      </body>
    </html>
  );
}
