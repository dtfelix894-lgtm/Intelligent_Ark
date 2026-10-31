import { redirectAdminIfSignedIn } from "@/lib/route-guard";

export default async function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  await redirectAdminIfSignedIn();
  return children;
}
