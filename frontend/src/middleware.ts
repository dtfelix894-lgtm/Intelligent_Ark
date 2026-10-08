import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const signedOut = (side: string) => request.cookies.get(`ark_${side}_signed_out`)?.value === "1";
  const cToken = !signedOut("c") && request.cookies.get("c_token")?.value;
  const bToken = !signedOut("b") && request.cookies.get("b_token")?.value;
  const finish = (response: NextResponse) => {
    for (const side of ["c", "b"]) {
      if (signedOut(side)) {
        response.cookies.set(`${side}_token`, "", { path: "/", maxAge: 0, httpOnly: true });
        response.cookies.set(`ark_${side}_signed_out`, "", { path: "/", maxAge: 0 });
      }
    }
    return response;
  };
  // Preserve the browser-facing Host rather than Next's internal localhost.
  // Next's RSC adapter requires an absolute redirect URL.
  const redirect = (path: string) => {
    const url = request.nextUrl.clone();
    url.host = request.headers.get("host") || url.host;
    url.pathname = path;
    url.search = "";
    return finish(NextResponse.redirect(url));
  };

  // ── C 端：/chat 受保护 ──────────────────────────────────────────────────────
  if (pathname.startsWith("/chat")) {
    if (!cToken) {
      return redirect("/login");
    }
    return finish(NextResponse.next());
  }

  // ── B 端：admin-login 本身 ──────────────────────────────────────────────────
  if (pathname === "/admin-login") {
    // 已登录 → 直接去管理后台（不会再被 /admin* 拦截）
    if (bToken) {
      return redirect("/admin");
    }
    // 未登录 → 允许留在登录页
    return finish(NextResponse.next());
  }

  // ── B 端：/admin 及所有子路由 ─────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    if (!bToken) {
      return redirect("/admin-login");
    }
    return finish(NextResponse.next());
  }

  // ── C 端：已登录用户访问 /login → 重定向到 /chat ─────────────────────────
  if (pathname === "/login") {
    if (cToken) {
      return redirect("/chat");
    }
    return finish(NextResponse.next());
  }

  return finish(NextResponse.next());
}

export const config = {
  matcher: [
    // 排除静态资源、API 路由和带扩展名的文件
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.).*)",
  ],
};
