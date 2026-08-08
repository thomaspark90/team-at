'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

// router.refresh()는 서버 데이터를 다시 받아오는 동안 아무 표시가 없어
// "눌렀는데 안 바뀌었네" 하고 다시 누르게 된다.
// useRefresh()로 감싸면 갱신 동안 전역 인디케이터(<RefreshIndicator />, 루트 레이아웃 장착)가 뜬다.

let notify: ((delta: number) => void) | null = null;

export function useRefresh() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  useEffect(() => {
    if (!refreshing) return;
    notify?.(1);
    return () => notify?.(-1);
  }, [refreshing]);

  const refresh = () => startTransition(() => router.refresh());
  return { refresh, refreshing };
}

export function RefreshIndicator() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    notify = (d) => setCount((c) => Math.max(0, c + d));
    return () => {
      notify = null;
    };
  }, []);

  if (count === 0) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-6 right-6 z-[100] rounded-full bg-foreground/90 px-3.5 py-2 text-[13px] text-background shadow-lg"
    >
      <span className="animate-pulse">목록 갱신 중…</span>
    </div>
  );
}
