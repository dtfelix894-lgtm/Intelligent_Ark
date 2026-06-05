/**
 * 前端 API client。
 *
 * 认证设计：
 * - 登录成功后，后端签发 JWT。前端将其保存到：
 *   · localStorage（key: ark_c_token / ark_b_token）——用于 Authorization 头
 *   · 非 HttpOnly cookie（key: c_token / b_token）——供 Next.js middleware 做路由守卫
 * - 后端同时会下发 HttpOnly cookie（域名 localhost:8001），但跨域下前端 middleware 读不到，
 *   因此仍需在前端显式 set cookie。JWT 与 Cookie 值保持一致。
 * - 登出时清除上述所有位置。
 */
import Cookies from "js-cookie";

// 优先用 NEXT_PUBLIC_API_BASE 环境变量（内网穿透场景必须配置）；
// 否则走同 hostname + 8001 端口（本机/局域网开发）
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  (typeof window !== "undefined"
    ? `http://${window.location.hostname}:8001`
    : "http://localhost:8001");

export type Side = "c" | "b";

const TOKEN_LS_KEY: Record<Side, string> = {
  c: "ark_c_token",
  b: "ark_b_token",
};

const COOKIE_KEY: Record<Side, string> = {
  c: "c_token",
  b: "b_token",
};

export function saveToken(side: Side, token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_LS_KEY[side], token);
  Cookies.set(COOKIE_KEY[side], token, {
    expires: 7,
    path: "/",
    sameSite: "lax",
  });
}

export function getToken(side: Side): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(TOKEN_LS_KEY[side]) ||
    Cookies.get(COOKIE_KEY[side]) ||
    null
  );
}

export function clearToken(side: Side) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_LS_KEY[side]);
  Cookies.remove(COOKIE_KEY[side], { path: "/" });
}

/**
 * 自动挑选最合适的 token：优先使用 side 指定的。
 * 未指定时按当前路由推断：/admin* 页面优先 B 端，其余页面优先 C 端，
 * 各自再回退到另一端。与下方 401 跳转的分流逻辑保持一致，避免 C 端页面
 * 残留的 B 端 admin token 被误发给只认 C 端身份的接口（如 ASR/TTS）。
 */
function pickToken(side?: Side): string | null {
  if (side) return getToken(side);
  const onAdmin =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin");
  return onAdmin
    ? getToken("b") || getToken("c")
    : getToken("c") || getToken("b");
}

export interface ApiFetchOptions extends RequestInit {
  /** 指定使用哪一端的 token；不填则自动挑选 */
  side?: Side;
  /** 401 时是否自动跳转到登录页（默认 true） */
  autoRedirectOn401?: boolean;
}

/**
 * 统一的 API 请求封装。
 * - 自动附加 Authorization: Bearer <token>
 * - 自动 JSON 序列化 body（若 body 是普通对象）
 * - 自动 credentials: include 以兼容后端 HttpOnly cookie
 * - 401 时清除本端 token 并跳登录页（可关闭）
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { side, autoRedirectOn401 = true, headers, body, ...rest } = options;

  const token = pickToken(side);
  const finalHeaders = new Headers(headers);

  if (token && !finalHeaders.has("Authorization")) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  let finalBody = body as BodyInit | null | undefined;
  if (
    body !== undefined &&
    body !== null &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof URLSearchParams)
  ) {
    if (!finalHeaders.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json");
    }
    finalBody = JSON.stringify(body);
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: finalBody,
    credentials: "include",
  });

  if (res.status === 401 && autoRedirectOn401 && typeof window !== "undefined") {
    // 判断跳 C 端还是 B 端登录页
    const onAdmin = window.location.pathname.startsWith("/admin");
    if (onAdmin) {
      clearToken("b");
      if (window.location.pathname !== "/admin-login") {
        window.location.replace("/admin-login");
      }
    } else {
      clearToken("c");
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
  }

  return res;
}

/** 便捷 JSON 封装：自动解析 JSON 并在非 2xx 时抛错（带 detail 信息）。 */
export async function apiJson<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const res = await apiFetch(path, options);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // 非 JSON 响应
  }
  if (!res.ok) {
    const msg =
      (data && (typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((e: { msg: string }) => e.msg).join("；")
          : data.message)) || `请求失败 (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}
