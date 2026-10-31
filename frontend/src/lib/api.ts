/**
 * 前端 API client。
 *
 * 认证设计：
 * - 同源部署默认依赖后端下发的 HttpOnly Cookie，避免旧 localStorage token
 *   覆盖有效会话。
 * - 只有显式配置 NEXT_PUBLIC_API_BASE、前后端跨域时，才使用 localStorage
 *   中的 JWT 作为 Authorization Bearer token。
 * - 非 HttpOnly cookie 仍用于 Next.js middleware 路由守卫。
 * - 登出清除本地凭证，并由网站中间件清除本端 HttpOnly Cookie。
 */
import Cookies from "js-cookie";

// NEXT_PUBLIC_API_BASE 仅在前后端不同源时才需要显式配置；默认留空 → 前端请求同源 /api，
// 由 next.config.js 的 rewrites 转发到 API_UPSTREAM（默认 http://127.0.0.1:8001）。
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

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
  Cookies.remove(`ark_${side}_signed_out`, { path: "/" });
  try { localStorage.setItem(TOKEN_LS_KEY[side], token); } catch { /* Cookie auth remains available. */ }
  Cookies.set(COOKIE_KEY[side], token, {
    expires: 7,
    path: "/",
    sameSite: "lax",
    secure: window.location.protocol === "https:",
  });
}

export function getToken(side: Side): string | null {
  if (typeof window === "undefined") return null;
  if (Cookies.get(`ark_${side}_signed_out`)) return null;
  try {
    const token = localStorage.getItem(TOKEN_LS_KEY[side]);
    if (token) return token;
  } catch { /* Storage may be blocked by browser policy. */ }
  return Cookies.get(COOKIE_KEY[side]) || null;
}

export function clearToken(side: Side) {
  if (typeof window === "undefined") return;
  // Browser JS cannot expire HttpOnly cookies. Middleware consumes this
  // revocation-only marker on the next page navigation, even if API is down.
  Cookies.set(`ark_${side}_signed_out`, "1", { path: "/", sameSite: "lax", secure: window.location.protocol === "https:" });
  try { localStorage.removeItem(TOKEN_LS_KEY[side]); } catch { /* Do not block logout. */ }
  Cookies.remove(COOKIE_KEY[side], { path: "/" });
}

/**
 * 自动挑选最合适的 token：优先使用 side 指定的。
 * 未指定时按当前路由推断：/admin* 页面优先 B 端，其余页面优先 C 端，
 * 不回退到另一端。与下方 401 跳转的分流逻辑保持一致，避免 C 端页面
 * 残留的 B 端 admin token 被误发给只认 C 端身份的接口（如 ASR/TTS）。
 */
function pickToken(side?: Side): string | null {
  if (side) return getToken(side);
  const onAdmin =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin");
  return onAdmin
    ? getToken("b")
    : getToken("c");
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** JSON 请求整体时限，包含响应正文读取；默认 15 秒。 */
  timeoutMs?: number;
  body?: BodyInit | Record<string, unknown> | null;
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
async function request(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { side, autoRedirectOn401 = true, headers, body, ...rest } = options;

  // 同源 /api 请求优先使用 HttpOnly Cookie。跨域直连后端时浏览器 Cookie
  // 可能不可用，才回退到 localStorage Bearer token。
  const token = API_BASE ? pickToken(side) : null;
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
    const onAdmin = window.location.pathname.startsWith("/admin");
    const sessionSide: Side = side || (onAdmin ? "b" : "c");
    clearToken(sessionSide);
    // The website clears its own HttpOnly cookie during navigation; recovery
    // must not depend on another request to the unavailable backend.
    const loginPath = sessionSide === "b" ? "/admin-login" : "/login";
    if (window.location.pathname !== loginPath) {
      window.location.replace(loginPath);
    }
  }

  return res;
}

async function withDeadline<T>(options: ApiFetchOptions, run: (scoped: ApiFetchOptions) => Promise<T>): Promise<T> {
  const { timeoutMs = 15000, signal, ...rest } = options;
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await run({ ...rest, signal: controller.signal });
  } catch (reason) {
    if (timedOut) throw new Error("请求超时，请检查网络后重试");
    throw reason;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/** 将接口错误转成用户可读文案，避免暴露状态码、英文参数名或内部术语。 */
function userFacingApiError(status: number, raw: string): string {
  const text = raw.trim();
  const looksInternal =
    !text ||
    /dev_override|assignee|due_date|still_risk|improved|view_alert|localhost|\.env|HTTPException|Traceback|Error:/i.test(
      text,
    ) ||
    /^\(\d{3}\)$/.test(text) ||
    text.startsWith("请求失败 (");
  if (looksInternal) {
    if (status === 401) return "登录已失效，请重新登录";
    if (status === 403) return "暂无权限执行此操作";
    if (status === 404) return "未找到相关内容，请刷新后重试";
    if (status === 409) return text.includes("认领") || text.includes("注册") ? text : "操作冲突，请刷新后重试";
    if (status === 422) return text.includes("工号") || text.includes("日期") || text.includes("风险") ? text : "提交的信息不完整或格式不正确";
    if (status === 502 || status === 503) return "服务暂时不可用，请稍后重试";
    return "操作未成功，请稍后重试";
  }
  return text;
}

/** 原始响应在收到响应头时完成；JSON 使用下方覆盖正文读取的时限。 */
export function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  return withDeadline(options, (scoped) => request(path, scoped));
}

/** 便捷 JSON 封装：自动解析 JSON 并在非 2xx 时抛错（带 detail 信息）。 */
export async function apiJson<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  return withDeadline(options, async (scoped) => {
  const res = await request(path, scoped);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // 非 JSON 响应
  }
  if (!res.ok) {
    const raw =
      (data && (typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((e: { msg: string }) => e.msg).join("；")
          : data.message)) || "";
    throw new Error(userFacingApiError(res.status, String(raw || "")));
  }
  return data as T;
  });
}

export async function logout(side: Side) {
  // 服务端 /api/auth/*-logout 不校验身份，调用它只是为了清掉后端下发的 HttpOnly Cookie。
  // 后端不可达时本地登出仍须完成：否则 token 会一直留在浏览器里，用户再也退不出去。
  try {
    await apiFetch(`/api/auth/${side}-logout`, { method: "POST", side, autoRedirectOn401: false, timeoutMs: 3000 });
  } catch {
    // 忽略：网络异常不应阻断登出
  } finally {
    clearToken(side);
  }
}
