import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "智伴方舟 · 高校工作台",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
