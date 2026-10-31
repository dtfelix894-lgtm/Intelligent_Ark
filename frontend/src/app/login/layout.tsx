import { redirectStudentIfSignedIn } from "@/lib/route-guard";

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  await redirectStudentIfSignedIn();
  return children;
}
