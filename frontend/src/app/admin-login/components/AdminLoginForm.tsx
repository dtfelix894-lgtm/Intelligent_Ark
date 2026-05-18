"use client";

import { useState, forwardRef, useImperativeHandle } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, User, Eye, EyeOff, AlertCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch, saveToken } from "@/lib/api";

const adminLoginSchema = z.object({
  workerId: z.string().min(1, "请输入工号"),
  password: z.string().min(1, "请输入密码"),
});

type AdminLoginData = z.infer<typeof adminLoginSchema>;

export interface AdminLoginFormHandle {
  fillDemo: (workerId: string, password: string) => void;
  resetForm: () => void;
}

interface AdminLoginFormProps {
  adminType: "G" | "C";
  onSuccess: () => void;
  onSwitchToRegister: () => void;
}

const G_ICON = "🎓";
const C_ICON = "👥";

const AdminLoginForm = forwardRef<AdminLoginFormHandle, AdminLoginFormProps>(({
  adminType,
  onSuccess,
  onSwitchToRegister,
}, ref) => {
  const [showPwd, setShowPwd] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setValue,
  } = useForm<AdminLoginData>({ resolver: zodResolver(adminLoginSchema) });

  useImperativeHandle(ref, () => ({
    fillDemo: (workerId: string, password: string) => {
      setLoginError(null);
      setValue("workerId", workerId, { shouldValidate: true });
      setValue("password", password, { shouldValidate: true });
    },
    resetForm: () => {
      reset();
      setLoginError(null);
      setIsLoading(false);
    },
  }));

  const onSubmit = async (data: AdminLoginData) => {
    if (isLoading) return;

    setLoginError(null);
    setIsLoading(true);

    // 验证工号格式
    const pattern = adminType === "G" ? /^G\d{3}$/ : /^C\d{3}$/;
    if (!pattern.test(data.workerId)) {
      setLoginError(`工号格式错误：${adminType === "G" ? "G" : "C"}开头 + 3位数字`);
      setIsLoading(false);
      return;
    }

    try {
      const res = await apiFetch("/api/auth/b-login", {
        method: "POST",
        autoRedirectOn401: false,
        body: { worker_id: data.workerId, password: data.password } as any,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        const msg = typeof json.detail === "string"
          ? json.detail
          : Array.isArray(json.detail)
            ? json.detail.map((e: { msg: string }) => e.msg).join("；")
            : (json.message || "工号或密码错误");
        setLoginError(msg);
        return;
      }

      if (!json.token) {
        setLoginError("登录响应缺少 token");
        return;
      }
      // 登录成功：保存 JWT + 管理员元信息
      saveToken("b", json.token);
      const adminInfo = {
        workerId: data.workerId,
        type: adminType,
        schoolName: json.school_name || "",
      };
      localStorage.setItem("b_admin_info", JSON.stringify(adminInfo));

      // 触发父组件跳转
      onSuccess();
    } catch {
      setLoginError("网络异常，请检查后端服务是否启动");
    } finally {
      // 无论成功失败都必须解除 loading 状态，防止按钮卡死
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <div
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
            adminType === "G"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
          )}
        >
          {adminType === "G" ? G_ICON : C_ICON}
          {adminType === "G" ? "高校管理员登录" : "社区管理员登录"}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* 工号 */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">工号</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              {...register("workerId")}
              placeholder={adminType === "G" ? "例：G001" : "例：C001"}
              maxLength={4}
              className={cn(
                "w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors uppercase",
                errors.workerId ? "border-red-500/60 focus:border-red-500" : "border-slate-600 focus:border-blue-500"
              )}
            />
          </div>
          {errors.workerId && <p className="text-xs text-red-400 mt-1">{errors.workerId.message}</p>}
        </div>

        {/* 密码 */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">密码</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              {...register("password")}
              type={showPwd ? "text" : "password"}
              placeholder="请输入密码"
              className={cn(
                "w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/60 border text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors",
                errors.password ? "border-red-500/60 focus:border-red-500" : "border-slate-600 focus:border-blue-500"
              )}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
        </div>

        {/* 错误提示 */}
        {loginError && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2.5 rounded-xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {loginError}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={isLoading}
          className={cn(
            "w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
            isLoading
              ? "bg-slate-600 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
          )}
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
              登录中...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              安全登录
            </>
          )}
        </button>

        {/* 注册入口 */}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="w-full py-2 text-slate-500 text-xs hover:text-slate-300 transition-colors"
        >
          还没有账号？去注册
        </button>
      </form>
    </div>
  );
});

AdminLoginForm.displayName = "AdminLoginForm";

export default AdminLoginForm;
