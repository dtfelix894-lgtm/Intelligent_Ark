import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "🛡️ 智伴方舟 · 管理后台",
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
