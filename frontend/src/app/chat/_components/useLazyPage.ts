"use client";

import { useEffect, useState } from "react";

/** 列表分页懒加载：先展示 pageSize 条，点击「加载更多」递增。 */
export function useLazyPage<T>(items: T[], pageSize = 5) {
  const [count, setCount] = useState(pageSize);

  useEffect(() => {
    setCount(pageSize);
  }, [items, pageSize]);

  const slice = items.slice(0, count);
  const hasMore = count < items.length;

  return {
    slice,
    hasMore,
    loadMore: () => setCount((current) => Math.min(current + pageSize, items.length)),
    shown: slice.length,
    total: items.length,
  };
}
