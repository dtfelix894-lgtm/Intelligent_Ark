"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, User, Eye, EyeOff, AlertCircle, Building2, ArrowLeft, Key } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch, saveToken } from "@/lib/api";

const adminRegisterSchema = z.object({
  workerId: z.string().min(1, "请输入工号"),
  password: z.string().min(6, "密码至少6位"),
  schoolName: z.string().min(1, "请输入学校名称").optional(),
  inviteCode: z.string().min(1, "请输入邀请码"),
});

type AdminRegisterData = z.infer<typeof adminRegisterSchema>;

interface AdminRegisterFormProps {
  onSwitchToLogin: () => void;
  adminType: "G" | "C";
  onLoginSuccess: () => void;
}

const G_ICON = "🎓";
const C_ICON = "👥";

export default function AdminRegisterForm({
  onSwitchToLogin,
  adminType,
  onLoginSuccess,
}: AdminRegisterFormProps) {
  const [showPwd, setShowPwd] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<AdminRegisterData>({ resolver: zodResolver(adminRegisterSchema) });

  const onSubmit = async (data: AdminRegisterData) => {
    if (isSubmitting) return;

    setRegisterError(null);

    // 验证工号格式
    const pattern = adminType === "G" ? /^G\d{3}$/ : /^C\d{3}$/;
    if (!pattern.test(data.workerId)) {
      setRegisterError(`工号格式错误：${adminType === "G" ? "G" : "C"}开头 + 3位数字`);
      return;
    }

    try {
      // 第一步：注册（需邀请码）
      const res = await apiFetch("/api/auth/b-register", {
        method: "POST",
        autoRedirectOn401: false,
        body: {
          worker_id: data.workerId,
          password: data.password,
          admin_type: adminType,
          school_name: adminType === "G" ? data.schoolName : null,
          invite_code: data.inviteCode,
        } as any,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        const msg = typeof json.detail === "string"
          ? json.detail
          : Array.isArray(json.detail)
            ? json.detail.map((e: { msg: string }) => e.msg).join("；")
            : "注册失败，请稍后重试";
        setRegisterError(msg);
        return;
      }

      // 第二步：自动登录
      const loginRes = await apiFetch("/api/auth/b-login", {
        method: "POST",
        autoRedirectOn401: false,
        body: { worker_id: data.workerId, password: data.password } as any,
      });
      const loginJson = await loginRes.json();

      if (!loginRes.ok || !loginJson.success || !loginJson.token) {
        setRegisterError("注册成功！请手动登录。");
        return;
      }

      // 登录成功：保存 JWT + 管理员元信息
      saveToken("b", loginJson.token);
      localStorage.setItem("b_admin_info", JSON.stringify({
        workerId: data.workerId,
        type: adminType,
        schoolName: data.schoolName || "",
      }));
      onLoginSuccess();
    } catch {
      setRegisterError("网络异常，请检查后端服务是否启动");
    }
  };

  const handleDemoFill = () => {
    const demoId = adminType === "G" ? "G001" : "C001";
    const demoSchool = adminType === "G" ? "保定学院" : "";
    setValue("workerId", demoId);
    setValue("password", "123456");
    if (adminType === "G") {
      setValue("schoolName", demoSchool);
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
          {adminType === "G" ? "高校管理员注册" : "社区管理员注册"}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {adminType === "G"
            ? "工号格式：G + 3位数字（如 G001）"
            : "工号格式：C + 3位数字（如 C001）"}
        </p>
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

        {/* 学校名称 - 仅高校管理员 */}
        {adminType === "G" && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">学校名称</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                {...register("schoolName")}
                placeholder="请输入学校名称"
                className={cn(
                  "w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors",
                  errors.schoolName ? "border-red-500/60 focus:border-red-500" : "border-slate-600 focus:border-blue-500"
                )}
              />
            </div>
            {errors.schoolName && <p className="text-xs text-red-400 mt-1">{errors.schoolName.message}</p>}
          </div>
        )}

        {/* 邀请码 */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">邀请码</label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              {...register("inviteCode")}
              placeholder="请输入管理员邀请码"
              className={cn(
                "w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors",
                errors.inviteCode ? "border-red-500/60 focus:border-red-500" : "border-slate-600 focus:border-blue-500"
              )}
            />
          </div>
          {errors.inviteCode && <p className="text-xs text-red-400 mt-1">{errors.inviteCode.message}</p>}
        </div>

        {/* 密码 */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">密码</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              {...register("password")}
              type={showPwd ? "text" : "password"}
              placeholder="请输入密码（至少6位）"
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
        {registerError && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2.5 rounded-xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {registerError}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "w-full py-3 rounded-xl text-sm font-semibold transition-all",
            isSubmitting
              ? "bg-slate-600 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
          )}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
              注册中...
            </span>
          ) : (
            "完成注册"
          )}
        </button>

        {/* 演示按钮 */}
        <button
          type="button"
          onClick={handleDemoFill}
          className="w-full py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20 transition-all"
        >
          演示：填入 {adminType === "G" ? "G001" : "C001"}
        </button>

        {/* 返回登录 */}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="w-full py-2 text-slate-500 text-xs hover:text-slate-300 transition-colors flex items-center justify-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          已有账号？去登录
        </button>
      </form>
    </div>
  );
}
