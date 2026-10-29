"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, GraduationCap, HeartHandshake, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { apiJson, saveToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [school, setSchool] = useState("");
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!account.trim() || password.length < 6) {
      setError("请输入学号和至少 6 位密码。");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{ token?: string }>(`/api/auth/${registering ? "c-register" : "c-login"}`, {
        method: "POST",
        side: "c",
        autoRedirectOn401: false,
        body: registering ? { account: account.trim(), password, role: "student", school: school.trim(), student_id: studentId.trim() } : { account: account.trim(), password },
      });
      if (data.token) saveToken("c", data.token);
      router.push("/chat");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "网络异常，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setRegistering((value) => !value);
    setError("");
  }

  return (
    <main id="main-content" className="ark-grid-bg grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden flex-col justify-between bg-gradient-to-br from-violet-950 via-violet-900 to-emerald-900 p-12 text-white lg:flex xl:p-16">
        <Link href="/" className="flex w-fit items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-white"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><GraduationCap className="h-6 w-6" aria-hidden="true" /></span><span><span className="block font-bold">智伴方舟</span><span className="block text-xs text-violet-100">高校心理支持平台</span></span></Link>
        <div className="max-w-xl"><HeartHandshake className="h-12 w-12 text-emerald-300" aria-hidden="true" /><h1 className="mt-7 text-4xl font-bold leading-tight">在这里，你可以安心说出自己的感受</h1><p className="mt-5 text-lg leading-8 text-violet-100">知心学姐会陪你从最困扰的一件事开始。学业、就业、人际关系或只是今天有点累，都可以慢慢说。</p></div>
        <p className="flex max-w-lg items-start gap-3 text-sm leading-6 text-violet-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />平台提供心理支持和风险识别，不替代专业诊断；紧急情况下请及时联系现实中的专业人员。</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground lg:hidden"><ArrowLeft className="h-4 w-4" aria-hidden="true" />返回首页</Link>
          <div className="ark-surface rounded-[1.75rem] p-6 sm:p-8">
            <div className="mb-7"><p className="text-sm font-semibold text-primary">智伴方舟 · 学生端</p><h1 className="mt-2 text-2xl font-bold tracking-tight">{registering ? "创建学生账号" : "欢迎回到陪伴空间"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{registering ? "填写基本信息后即可进入高校陪伴空间。" : "使用学号登录，继续和知心学姐聊聊。"}</p></div>
            <form onSubmit={submit} noValidate className="space-y-5">
              <div><label htmlFor="student-account" className="mb-2 block text-sm font-semibold">学号</label><input id="student-account" name="username" autoComplete="username" inputMode="text" value={account} onChange={(e) => setAccount(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-white px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="请输入学号" /></div>
              <div><div className="mb-2 flex items-center justify-between"><label htmlFor="student-password" className="text-sm font-semibold">密码</label><span className="text-xs text-muted-foreground">至少 6 位</span></div><div className="relative"><LockKeyhole className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" aria-hidden="true" /><input id="student-password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-white pl-12 pr-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div></div>
              {registering && <div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="school" className="mb-2 block text-sm font-semibold">学校 <span className="font-normal text-muted-foreground">（可选）</span></label><input id="school" autoComplete="organization" value={school} onChange={(e) => setSchool(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-white px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div><div><label htmlFor="student-id" className="mb-2 block text-sm font-semibold">学籍号 <span className="font-normal text-muted-foreground">（可选）</span></label><input id="student-id" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-white px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div></div>}
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}{busy ? "处理中…" : registering ? "注册并进入" : "进入陪伴空间"}</button>
            </form>
            <button type="button" onClick={switchMode} className="mt-4 min-h-11 w-full rounded-xl text-sm font-semibold text-primary transition-colors hover:bg-secondary">{registering ? "已有账号，返回登录" : "首次使用？创建学生账号"}</button>
            <div className="my-6 h-px bg-border" />
            <Link href="/admin-login" className="flex min-h-11 items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">高校工作端登录</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
