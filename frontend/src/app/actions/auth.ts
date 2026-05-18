"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function adminLogoutAction() {
  cookies().delete("b_token");
  cookies().delete("b_role");
  redirect("/admin-login");
}
