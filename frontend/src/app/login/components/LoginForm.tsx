"use client";

import { useState, useImperativeHandle, forwardRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Smartphone, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch, saveToken } from "@/lib/api";

const loginSchema = z.object({
  account: z.string().min(1, "请输入账号"),
  password: z.string().min(6, "密码至少6位"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export interface LoginFormHandle {
  fillDemo: (account: string, password: string) => void;
}

interface LoginFormProps {
  onSuccess: () => void;
}

const LoginForm = forwardRef<LoginFormHandle, LoginFormProps>(({ onSuccess }, ref) => {
  const [showPwd, setShowPwd] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  useImperativeHandle(ref, () => ({
    fillDemo: (account: string, password: string) => {
      setValue("account", account, { shouldValidate: true });
      setValue("password", password, { shouldValidate: true });
    },
  }));

  const onSubmit = async (data: LoginFormData) => {
    const controller = new AbortController();
    const signal = controller.signal;

    console.log("1. Form submitted, account:", data.account);
    try {
      console.log("2. Sending fetch request...");
      const res = await apiFetch("/api/auth/c-login", {
        method: "POST",
        body: { account: data.account, password: data.password } as any,
        signal,
        autoRedirectOn401: false,
      });
      console.log("3. Response received, status:", res.status);

      if (signal.aborted) return;

      const json = await res.json();
      console.log("4. JSON parsed:", json);

      if (!res.ok || !json.success) {
        const msg = typeof json.detail === "string"
          ? json.detail
          : Array.isArray(json.detail)
            ? json.detail.map((e: { msg: string }) => e.msg).join("；")
            : "账号或密码错误";
        alert(msg);
        return;
      }

      console.log("5. Login success, saving token...");
      // 登录成功：保存 JWT（localStorage + cookie 双写）
      if (!json.token) {
        alert("登录响应缺少 token，请联系管理员");
        return;
      }
      saveToken("c", json.token);

      // ── 动态判断角色类型，存入 currentUser ──
      const account = data.account.trim();
      const isSocial = account.includes("@");
      const currentUser = isSocial
        ? {
            role: "social" as const,
            account,
            email: account,
            phone: "",
            displayName: "社会用户",
          }
        : {
            role: "student" as const,
            account,
            studentId: account,
            school: "保定学院",
            degree: "本科生",
            displayName: "张同学",
          };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      console.log("6. Redirecting to /chat...");

      // 跳转到聊天页
      window.location.replace("/chat");
    } catch (err) {
      if (signal.aborted) return;
      console.error("Error:", err);
      alert("网络异常，请检查后端服务是否启动");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">账号（学号 / QQ邮箱）</label>
        <div className="relative">
          <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            {...register("account")}
            placeholder="请输入学号或QQ邮箱"
            className={cn(
              "w-full pl-10 pr-4 py-2.5 rounded-xl border bg-white/70 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors",
              errors.account
                ? "border-red-400 focus:border-red-500"
                : "border-slate-200 focus:border-purple-400"
            )}
          />
        </div>
        {errors.account && <p className="text-xs text-red-500 mt-1">{errors.account.message}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">密码</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            {...register("password")}
            type={showPwd ? "text" : "password"}
            placeholder="请输入密码"
            className={cn(
              "w-full pl-10 pr-10 py-2.5 rounded-xl border bg-white/70 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors",
              errors.password
                ? "border-red-400 focus:border-red-500"
                : "border-slate-200 focus:border-purple-400"
            )}
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
      </div>

      <div className="flex justify-end">
        <span className="text-xs text-purple-600 hover:underline cursor-pointer">忘记密码？</span>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-semibold shadow-lg hover:shadow-xl hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            登录中...
          </>
        ) : (
          <>
            <ShieldCheck className="w-4 h-4" />
            登录
          </>
        )}
      </button>
    </form>
  );
});

LoginForm.displayName = "LoginForm";

export default LoginForm;
