import { requireStudentSession } from "@/lib/route-guard";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  await requireStudentSession();
  return children;
}
