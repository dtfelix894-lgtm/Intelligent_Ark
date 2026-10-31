import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Side = "c" | "b";

async function sideToken(side: Side): Promise<string | null> {
  const store = await cookies();
  if (store.get(`ark_${side}_signed_out`)?.value === "1") return null;
  return store.get(`${side}_token`)?.value ?? null;
}

/** 学生端受保护路由（/chat） */
export async function requireStudentSession() {
  if (!(await sideToken("c"))) redirect("/login");
}

/** 管理端受保护路由（/admin） */
export async function requireAdminSession() {
  if (!(await sideToken("b"))) redirect("/admin-login");
}

/** 已登录学生访问 /login 时跳转聊天 */
export async function redirectStudentIfSignedIn() {
  if (await sideToken("c")) redirect("/chat");
}

/** 已登录管理员访问 /admin-login 时跳转工作台 */
export async function redirectAdminIfSignedIn() {
  if (await sideToken("b")) redirect("/admin");
}
