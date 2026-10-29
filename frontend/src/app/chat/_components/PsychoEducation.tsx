"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { EDU_ARTICLES, EDU_CATEGORIES } from "./psychoEducationData";

export function PsychoEducation() {
  const [categoryId, setCategoryId] = useState(EDU_CATEGORIES[0].id);
  const [articleId, setArticleId] = useState<string | null>(null);

  const articles = useMemo(
    () => EDU_ARTICLES.filter((a) => a.categoryId === categoryId),
    [categoryId],
  );
  const article = EDU_ARTICLES.find((a) => a.id === articleId) || null;

  if (article) {
    return (
      <article className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <button
          type="button"
          onClick={() => setArticleId(null)}
          className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回列表
        </button>
        <h3 className="text-base font-bold leading-7">{article.title}</h3>
        <p className="text-xs leading-5 text-muted-foreground">来源：{article.source}</p>
        <div className="space-y-3 text-sm leading-7 text-foreground">
          {article.body.map((para) => (
            <p key={para.slice(0, 12)}>{para}</p>
          ))}
        </div>
        <p className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-950">
          这不是诊断，也不提供治疗或用药建议。持续困扰请联系学校心理中心或身边可信任的人。
        </p>
      </article>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-sky-700" aria-hidden="true" />
        <h3 className="text-sm font-semibold">心理科普</h3>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        按主题浏览短文。资料供自我觉察参考，这不是诊断。
      </p>
      <div className="flex flex-wrap gap-2">
        {EDU_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            aria-pressed={categoryId === cat.id}
            onClick={() => setCategoryId(cat.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              categoryId === cat.id ? "bg-sky-700 text-white" : "border border-border bg-white hover:bg-muted"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {articles.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setArticleId(item.id)}
              className="ark-interactive flex w-full flex-col items-start rounded-xl border border-border bg-white px-3 py-3 text-left hover:bg-sky-50/60"
            >
              <span className="text-sm font-semibold">{item.title}</span>
              <span className="mt-1 text-xs leading-5 text-muted-foreground">{item.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
