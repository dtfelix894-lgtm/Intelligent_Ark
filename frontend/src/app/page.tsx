import Link from "next/link";
import { ArrowRight, BrainCircuit, GraduationCap, HeartHandshake, Leaf, ShieldCheck, Sparkles, Users } from "lucide-react";

const capabilities = [
  { icon: HeartHandshake, title: "AI 情绪陪伴", text: "和知心学姐聊聊学业、就业、人际关系与当下的心情。" },
  { icon: Leaf, title: "校园减压工具", text: "用声音、正念、解压锦囊与情绪释放工具照顾自己。" },
  { icon: BrainCircuit, title: "温和安全回应", text: "在对话中给出体贴、安全的回应，并在需要时提示你求助。" },
  { icon: Users, title: "需要时的求助入口", text: "一键查看心理中心、热线与预约等求助方式，联系身边可信任的人。" },
];

export default function Home() {
  return (
    <main id="main-content" className="ark-grid-bg min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-h-11 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
          <span className="ark-icon-tile"><GraduationCap className="h-6 w-6" aria-hidden="true" /></span>
          <span><span className="block font-bold tracking-tight">智伴方舟</span><span className="block text-xs text-muted-foreground">高校心理支持平台</span></span>
        </Link>
        <nav aria-label="主要导航" className="flex items-center gap-2">
          <Link href="/login" className="hidden min-h-11 items-center rounded-xl px-4 text-sm font-semibold transition-colors hover:bg-white sm:inline-flex">学生登录</Link>
          <Link href="/admin-login" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-white px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-secondary">高校工作端</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:pb-28 lg:pt-20">
        <div className="max-w-3xl ark-fade-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-4 py-2 text-sm font-medium text-primary shadow-sm"><Sparkles className="h-4 w-4" aria-hidden="true" />温暖、私密、面向高校生活</div>
          <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">有些情绪，<span className="text-primary">不必一个人扛</span></h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">知心学姐陪你聊聊学业、就业、人际关系和最近的心情。这里不急着评判，只陪你从最困扰的一件事开始。</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition-colors hover:bg-primary/90">进入陪伴空间 <ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>
            <Link href="/admin-login" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-white px-6 font-semibold shadow-sm transition-colors hover:bg-secondary">高校工作端登录</Link>
          </div>
          <p className="mt-5 flex max-w-2xl items-start gap-2 text-sm leading-6 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />对话用于心理支持和风险识别，不替代专业医疗诊断。</p>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-violet-200/70 via-white to-emerald-100/70 blur-2xl" />
          <div className="ark-surface rounded-[2rem] p-5 sm:p-7">
            <div className="flex items-center gap-3 border-b border-border pb-5">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground"><HeartHandshake className="h-6 w-6" aria-hidden="true" /></span>
              <div><p className="font-semibold">知心学姐</p><p className="flex items-center gap-2 text-sm text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-600" />正在陪伴你</p></div>
            </div>
            <div className="space-y-4 py-6">
              <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-secondary px-4 py-3 text-[15px] leading-7 text-secondary-foreground">晚上好。今天最想先放下的，是哪一件事？</div>
              <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-[15px] leading-7 text-primary-foreground">最近课程和求职叠在一起，有点喘不过气。</div>
              <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-[15px] leading-7 text-emerald-950">听起来你已经扛了很久。我们先把任务分成今天必须做和可以稍后做的两部分，好吗？</div>
            </div>
            <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">写下你此刻的感受…</div>
          </div>
        </div>
      </section>

      <section aria-labelledby="capability-title" className="border-y border-border/80 bg-white/75 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl"><p className="text-sm font-semibold text-primary">陪伴与自助</p><h2 id="capability-title" className="mt-2 text-3xl font-bold tracking-tight">愿意开口时，这里陪着你</h2><p className="mt-4 text-muted-foreground">面向高校学生的 AI 陪伴与自助减压；需要时也能找到求助入口。</p></div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map(({ icon: Icon, title, text }) => <article key={title} className="ark-soft-card p-6"><span className="ark-icon-tile"><Icon className="h-5 w-5" aria-hidden="true" /></span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
        <ShieldCheck className="mx-auto h-10 w-10 text-emerald-700" aria-hidden="true" />
        <h2 className="mt-5 text-2xl font-bold">现实中的支持，永远重要</h2>
        <p className="mx-auto mt-4 max-w-3xl leading-7 text-muted-foreground">如果你或身边的人正处于紧急危险中，请优先联系学校心理中心、辅导员、可信任的同学或老师，并及时寻求专业紧急援助。</p>
      </section>
    </main>
  );
}
