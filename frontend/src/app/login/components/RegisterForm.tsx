"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronDown, ShieldCheck, User, GraduationCap, Building2, Hash, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const studentSchema = z.object({
  education: z.enum(["本科生", "硕士研究生", "博士生"], { message: "请选择学历" }),
  school: z.string().min(2, "请输入学校名称"),
  studentId: z.string().min(1, "请输入学号"),
  password: z.string().min(6, "密码至少6位"),
});

const socialSchema = z.object({
  qqEmail: z
    .string()
    .min(1, "请输入QQ邮箱")
    .refine((v) => /^[1-9]\d{4,}@qq\.com$/.test(v), {
      message: "请输入有效的 QQ 邮箱（格式：数字@qq.com）",
    }),
  password: z.string().min(6, "密码至少6位"),
});

type StudentFormData = z.infer<typeof studentSchema>;
type SocialFormData = z.infer<typeof socialSchema>;

// ─── Simulated check ─────────────────────────────────────────────────────────

const EXISTING_STUDENT_IDS = new Set(["001", "2023001"]);
const EXISTING_QQ_EMAILS = new Set(["002@qq.com"]);

function checkStudentIdExists(value: string): boolean {
  return EXISTING_STUDENT_IDS.has(value);
}

function checkQQEmailExists(value: string): boolean {
  return EXISTING_QQ_EMAILS.has(value);
}

// ─── Shared Form Field ───────────────────────────────────────────────────────

function FormField({
  icon: Icon,
  label,
  error,
  children,
}: {
  icon: React.ElementType;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <div className="pl-10">{children}</div>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Student Register Form ────────────────────────────────────────────────────

function StudentRegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [accountAlert, setAccountAlert] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    trigger,
  } = useForm<StudentFormData>({ resolver: zodResolver(studentSchema) });

  const handleStudentIdBlur = useCallback(
    async (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (!value) return;
      if (checkStudentIdExists(value)) {
        setAccountAlert("该学号已注册，即将为您跳转至登录");
        setTimeout(() => { setAccountAlert(null); onSwitchToLogin(); }, 2000);
      } else {
        await trigger("studentId");
      }
    },
    [onSwitchToLogin, trigger]
  );

  const onSubmit = async (data: StudentFormData) => {
    try {
      const res = await apiFetch("/api/auth/c-register", {
        method: "POST",
        autoRedirectOn401: false,
        body: {
          account: data.studentId,
          password: data.password,
          role: "student",
          school: data.school,
          student_id: data.studentId,
          education: data.education,
        } as any,
      });

      const result = await res.json();

      if (res.ok) {
        alert("注册成功！即将跳转至登录页面");
        onSwitchToLogin();
      } else {
        const msg = typeof result.detail === "string"
          ? result.detail
          : Array.isArray(result.detail)
            ? result.detail.map((e: { msg: string }) => e.msg).join("；")
            : "注册失败，请稍后重试";
        setAccountAlert(msg);
      }
    } catch (error) {
      setAccountAlert("网络错误，请检查后端服务是否启动");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {accountAlert && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {accountAlert}
        </div>
      )}

      <FormField icon={GraduationCap} label="学历" error={errors.education?.message}>
        <div className="relative">
          <select
            {...register("education")}
            className="w-full appearance-none py-2.5 pr-8 rounded-xl border border-slate-200 bg-white/70 text-sm text-slate-800 outline-none focus:border-purple-400 transition-colors"
          >
            <option value="">请选择学历</option>
            <option value="本科生">本科生</option>
            <option value="硕士研究生">硕士研究生</option>
            <option value="博士生">博士生</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </FormField>

      <FormField icon={Building2} label="学校名称" error={errors.school?.message}>
        <input
          {...register("school")}
          placeholder="请输入学校名称"
          className="w-full py-2.5 rounded-xl border border-slate-200 bg-white/70 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-purple-400 transition-colors"
        />
      </FormField>

      <FormField icon={Hash} label="学号" error={errors.studentId?.message}>
        <input
          {...register("studentId")}
          placeholder="请输入学号"
          onBlur={handleStudentIdBlur}
          className="w-full py-2.5 rounded-xl border border-slate-200 bg-white/70 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-purple-400 transition-colors"
        />
      </FormField>

      <FormField icon={Lock} label="设置密码" error={errors.password?.message}>
        <input
          {...register("password")}
          type="password"
          placeholder="至少6位"
          className="w-full py-2.5 rounded-xl border border-slate-200 bg-white/70 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-purple-400 transition-colors"
        />
      </FormField>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-semibold shadow-lg hover:shadow-xl hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            注册中...
          </>
        ) : (
          <>
            <ShieldCheck className="w-4 h-4" />
            完成注册
          </>
        )}
      </button>
    </form>
  );
}

// ─── Social User Register Form ───────────────────────────────────────────────

function SocialRegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [accountAlert, setAccountAlert] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    trigger,
  } = useForm<SocialFormData>({ resolver: zodResolver(socialSchema) });

  const handleQQEmailBlur = useCallback(
    async (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (!value) return;
      if (checkQQEmailExists(value)) {
        setAccountAlert("该QQ邮箱已注册，即将为您跳转至登录");
        setTimeout(() => { setAccountAlert(null); onSwitchToLogin(); }, 2000);
      } else {
        await trigger("qqEmail");
      }
    },
    [onSwitchToLogin, trigger]
  );

  const onSubmit = async (data: SocialFormData) => {
    try {
      const res = await apiFetch("/api/auth/c-register", {
        method: "POST",
        autoRedirectOn401: false,
        body: {
          account: data.qqEmail,
          password: data.password,
          role: "social",
          qq_email: data.qqEmail,
        } as any,
      });

      const result = await res.json();

      if (res.ok) {
        alert("注册成功！即将跳转至登录页面");
        onSwitchToLogin();
      } else {
        const msg = typeof result.detail === "string"
          ? result.detail
          : Array.isArray(result.detail)
            ? result.detail.map((e: { msg: string }) => e.msg).join("；")
            : "注册失败，请稍后重试";
        setAccountAlert(msg);
      }
    } catch (error) {
      setAccountAlert("网络错误，请检查后端服务是否启动");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {accountAlert && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {accountAlert}
        </div>
      )}

      <FormField icon={User} label="QQ邮箱" error={errors.qqEmail?.message}>
        <input
          {...register("qqEmail")}
          type="email"
          placeholder="例如：12345678@qq.com"
          onBlur={handleQQEmailBlur}
          className="w-full py-2.5 rounded-xl border border-slate-200 bg-white/70 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-purple-400 transition-colors"
        />
      </FormField>

      <FormField icon={Lock} label="设置密码" error={errors.password?.message}>
        <input
          {...register("password")}
          type="password"
          placeholder="至少6位"
          className="w-full py-2.5 rounded-xl border border-slate-200 bg-white/70 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-purple-400 transition-colors"
        />
      </FormField>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-semibold shadow-lg hover:shadow-xl hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            注册中...
          </>
        ) : (
          <>
            <ShieldCheck className="w-4 h-4" />
            完成注册
          </>
        )}
      </button>
    </form>
  );
}

// ─── Main RegisterForm ────────────────────────────────────────────────────────

type RegisterTab = "student" | "social";

export default function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [tab, setTab] = useState<RegisterTab>("student");

  return (
    <div>
      {/* Inner Tab */}
      <div className="flex mb-5 bg-slate-100/80 rounded-lg p-1">
        {([
          { key: "student", label: "学生注册", icon: GraduationCap },
          { key: "social", label: "社会用户注册", icon: User },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all duration-200",
              tab === key
                ? "bg-white text-purple-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === "student" ? (
            <StudentRegisterForm onSwitchToLogin={onSwitchToLogin} />
          ) : (
            <SocialRegisterForm onSwitchToLogin={onSwitchToLogin} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
