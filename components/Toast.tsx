'use client';

import { useEffect, useState } from 'react';

// 공용 토스트 — 루트 레이아웃의 <Toaster />가 표시를 담당하고,
// 어느 클라이언트 컴포넌트든 toast('저장했어요') / toast('실패했어요', 'error')로 호출한다.
// 컨텍스트 없이 모듈 레벨 리스너 하나로 연결(내부용 앱 규모에 충분).

type ToastItem = { id: number; message: string; type: 'success' | 'error' };

let listener: ((t: ToastItem) => void) | null = null;
let seq = 0;

export function toast(message: string, type: 'success' | 'error' = 'success') {
  listener?.({ id: ++seq, message, type });
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    listener = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3500);
    };
    return () => {
      listener = null;
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`max-w-full rounded-lg px-4 py-2.5 text-[13px] shadow-lg ${
            t.type === 'error' ? 'bg-destructive text-white' : 'bg-foreground text-background'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
