import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const cToken = request.cookies.get("c_token")?.value;
  const bToken = request.cookies.get("b_token")?.value;

  // ── C 端：/chat 受保护 ──────────────────────────────────────────────────────
  if (pathname.startsWith("/chat")) {
    if (!cToken) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ── B 端：admin-login 本身 ──────────────────────────────────────────────────
  if (pathname === "/admin-login") {
    // 已登录 → 直接去管理后台（不会再被 /admin* 拦截）
    if (bToken) {
      const adminUrl = request.nextUrl.clone();
      adminUrl.pathname = "/admin";
      return NextResponse.redirect(adminUrl);
    }
    // 未登录 → 允许留在登录页
    return NextResponse.next();
  }

  // ── B 端：/admin 及所有子路由 ─────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    if (!bToken) {
      const adminLoginUrl = request.nextUrl.clone();
      adminLoginUrl.pathname = "/admin-login";
      return NextResponse.redirect(adminLoginUrl);
    }
    return NextResponse.next();
  }

  // ── C 端：已登录用户访问 /login → 重定向到 /chat ─────────────────────────
  if (pathname === "/login") {
    if (cToken) {
      const chatUrl = request.nextUrl.clone();
      chatUrl.pathname = "/chat";
      return NextResponse.redirect(chatUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 排除静态资源、API 路由和带扩展名的文件
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.).*)",
  ],
};
