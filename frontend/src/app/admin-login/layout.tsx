import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "智伴方舟 · 高校工作端登录",
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
