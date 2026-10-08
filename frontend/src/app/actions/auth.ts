"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function adminLogoutAction() {
  const store = await cookies();
  store.delete("b_token");
  store.delete("b_role");
  redirect("/admin-login");
}
