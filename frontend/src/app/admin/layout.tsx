import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/route-guard";

export const metadata: Metadata = {
  title: "智伴方舟 · 高校工作台",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession();
  return <>{children}</>;
}
