"use client";

import { useState } from "react";
import Cookies from "js-cookie";
import { apiFetch, saveToken } from "@/lib/api";

// ─── 主组件 ────────────────────────────────────────────────────────────────
export default function AdminLoginPage() {
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [role, setRole] = useState<"university" | "community">("university");

  // ── 输入变更 ───────────────────────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  // ── 提交逻辑 ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setLoading(true);

    try {
      const trimmedUsername = formData.username.trim();

      // 强制按角色校验前缀
      if (role === "university") {
        if (!/^[Gg]\d{3}$/.test(trimmedUsername)) {
          setError("高校工号需以 G 开头，后接3位数字（如 G001）");
          return;
        }
      } else {
        if (!/^[Cc]\d{3}$/.test(trimmedUsername)) {
          setError("社区工号需以 C 开头，后接3位数字（如 C001）");
          return;
        }
      }

      if (!formData.password) {
        setError("请输入密码");
        return;
      }

      // ── 登录请求 ────────────────────────────────────────────────────────────
      const res = await apiFetch(`/api/auth/b-login`, {
        method: "POST",
        autoRedirectOn401: false,
        body: {
          worker_id: trimmedUsername,
          password: formData.password,
        } as any,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError("工号或密码错误");
        return;
      }

      if (!json.token) {
        setError("登录响应缺少 token");
        return;
      }

      // 登录成功：保存 JWT（localStorage + cookie 双写） + 管理员元信息
      const prefix = role === "university" ? "G" : "C";
      saveToken("b", json.token);
      Cookies.set("b_role", role, { expires: 7, path: "/" });
      localStorage.setItem("b_admin_info", JSON.stringify({
        workerId: trimmedUsername,
        type: prefix,
        schoolName: json.school_name || "",
      }));
      window.location.href = "/admin";
    } catch {
      setError("网络异常，请检查后端服务是否启动");
    } finally {
      setLoading(false);
    }
  };

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center relative overflow-hidden">
      {/* 背景装饰 */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 mb-4">
            <span className="text-2xl">🛡</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-1">智伴方舟 · 管理后台</h1>
          <p className="text-sm text-slate-500">emotion governance system</p>
        </div>

        {/* 主卡片 */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">
          {/* 表单区域 */}
          <div className="px-6 py-5">
            {/* 角色切换 */}
            <div className="flex rounded-xl bg-slate-900/60 border border-slate-700 p-1 mb-4 gap-1">
              <button
                type="button"
                onClick={() => { setRole("university"); setError(null); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  role === "university"
                    ? "bg-emerald-600/80 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                高校管理员
              </button>
              <button
                type="button"
                onClick={() => { setRole("community"); setError(null); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  role === "community"
                    ? "bg-blue-600/80 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                社区管理员
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 工号 */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">工号</label>
                <input
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder={role === "university" ? "例：G001" : "例：C001"}
                  maxLength={4}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-600 focus:border-blue-500 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors uppercase"
                />
                <p className="text-xs text-slate-600 mt-1">
                  {role === "university" ? "G + 3位数字" : "C + 3位数字"}
                </p>
              </div>

              {/* 密码 */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">密码</label>
                <input
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  type="password"
                  placeholder="请输入密码"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-600 focus:border-blue-500 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                />
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2.5 rounded-xl">
                  {error}
                </div>
              )}

              {/* 提交按钮 */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  loading
                    ? "bg-slate-600 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
                }`}
              >
                {loading ? "登录中..." : "安全登录"}
              </button>

              {/* 演示按钮 */}
              <div className="flex gap-4 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setRole("university");
                    setFormData({ username: "G001", password: "123456" });
                    setError(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-emerald-700/50 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 text-xs transition-all"
                >
                  演示：高校 G001
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRole("community");
                    setFormData({ username: "C001", password: "123456" });
                    setError(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-blue-700/50 bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 text-xs transition-all"
                >
                  演示：社区 C001
                </button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-700/50 text-center">
            <a href="/login" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              ← 返回用户端
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-5">
          © 2026 智伴方舟 · 仅限授权人员访问
        </p>
      </div>
    </div>
  );
}
