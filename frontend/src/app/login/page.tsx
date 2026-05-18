"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Heart, LogIn, GraduationCap, User } from "lucide-react";
import { useRouter } from "next/navigation";
import RegisterForm from "./components/RegisterForm";
import LoginForm, { type LoginFormHandle } from "./components/LoginForm";

type View = "login" | "register";

const DEMO_ACCOUNTS = {
  student: { account: "001", password: "123456", label: "学生账号" },
  social: { account: "002@qq.com", password: "123456", label: "社会账号" },
};

export default function LoginPage() {
  const [view, setView] = useState<View>("register");
  const loginFormRef = useRef<LoginFormHandle>(null);
  const router = useRouter();

  const handleDemoLogin = (type: "student" | "social") => {
    const demo = DEMO_ACCOUNTS[type];
    setView("login");
    setTimeout(() => {
      loginFormRef?.current?.fillDemo(demo.account, demo.password);
    }, 50);
  };

  const handleLoginSuccess = () => {
    router.push("/chat");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-indigo-200 via-purple-200 to-pink-200">
      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />

      {/* Glass card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="backdrop-blur-xl bg-white/60 border border-white/40 rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-0 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Heart className="w-6 h-6 text-purple-600 fill-purple-600" />
              <h1 className="text-2xl font-bold text-slate-800">智伴方舟</h1>
            </div>
            <p className="text-sm text-slate-500 mb-6">智慧心理陪伴，守护每一份心灵</p>
          </div>

          {/* Global Tab: Login / Register */}
          <div className="px-8 mb-2">
            <div className="flex bg-slate-100/70 rounded-xl p-1">
              {(["register", "login"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                    view === v
                      ? "bg-white text-purple-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {v === "login" ? (
                    <>
                      <LogIn className="w-4 h-4" />
                      登录
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      注册
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Form area */}
          <div className="px-8 pb-4 relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, x: view === "login" ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: view === "login" ? 30 : -30 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                {view === "register" ? (
                  <RegisterForm onSwitchToLogin={() => setView("login")} />
                ) : (
                  <LoginForm ref={loginFormRef} onSuccess={handleLoginSuccess} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Demo quick-fill buttons (only visible in login view) */}
          <AnimatePresence>
            {view === "login" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="px-8 pb-6"
              >
                <div className="border-t border-slate-200/60 pt-4 flex gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => handleDemoLogin("student")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-600 text-xs hover:bg-purple-100 transition-colors"
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    演示：学生账号 001
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin("social")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 text-xs hover:bg-blue-100 transition-colors"
                  >
                    <User className="w-3.5 h-3.5" />
                    演示：社会账号 002
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          登录即表示同意{" "}
          <span className="text-purple-600 cursor-pointer hover:underline">《用户服务协议》</span>{" "}
          和{" "}
          <span className="text-purple-600 cursor-pointer hover:underline">《隐私政策》</span>
        </p>
      </div>
    </div>
  );
}
