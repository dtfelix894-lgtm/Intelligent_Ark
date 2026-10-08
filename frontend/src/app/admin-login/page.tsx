"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, GraduationCap, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { apiJson, saveToken } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [worker, setWorker] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await apiJson<{ token?: string; school_name?: string }>("/api/auth/b-login", { method: "POST", side: "b", autoRedirectOn401: false, body: { worker_id: worker.trim(), password } });
      if (data.token) saveToken("b", data.token);
      // The workbench loads identity from b-me; no shared identity cache.
      router.push("/admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "网络异常，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="ark-grid-bg grid min-h-screen lg:grid-cols-[.9fr_1.1fr]">
      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />返回首页</Link>
          <div className="ark-surface rounded-[1.75rem] p-6 sm:p-8">
            <div className="mb-7"><div className="ark-icon-tile"><Building2 className="h-5 w-5" aria-hidden="true" /></div><p className="mt-5 text-sm font-semibold text-primary">智伴方舟 · 高校工作端</p><h1 className="mt-2 text-2xl font-bold tracking-tight">管理员登录</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">仅面向 G 类高校辅导员和心理中心工作人员。</p></div>
            <form onSubmit={submit} className="space-y-5">
              <div><label htmlFor="worker-id" className="mb-2 block text-sm font-semibold">管理员工号</label><input id="worker-id" name="username" autoComplete="username" value={worker} onChange={(e) => setWorker(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-white px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="例如：G001" /></div>
              <div><label htmlFor="admin-password" className="mb-2 block text-sm font-semibold">密码</label><div className="relative"><LockKeyhole className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" aria-hidden="true" /><input id="admin-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-white pl-12 pr-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div></div>
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <button type="submit" disabled={busy || !worker.trim() || !password} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}{busy ? "登录中…" : "进入高校工作台"}</button>
            </form>
            <Link href="/login" className="mt-5 flex min-h-11 items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">返回学生端</Link>
          </div>
        </div>
      </section>
      <section className="hidden flex-col justify-between bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900 p-12 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><GraduationCap className="h-6 w-6" aria-hidden="true" /></span><span><span className="block font-bold">智伴方舟</span><span className="block text-xs text-violet-100">高校心理风险管理</span></span></div>
        <div className="max-w-xl"><ShieldCheck className="h-12 w-12 text-emerald-300" aria-hidden="true" /><h2 className="mt-7 text-4xl font-bold leading-tight">让每一次需要关注的表达，都有清晰去处</h2><p className="mt-5 text-lg leading-8 text-violet-100">工作台仅展示高校场景中的脱敏风险摘要，用于辅导员和心理中心按流程跟进。</p></div>
        <p className="text-sm leading-6 text-violet-100">请使用个人工作账号登录，并按照学校数据安全规范使用预警信息。</p>
      </section>
    </main>
  );
}
