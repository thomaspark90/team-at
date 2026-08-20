'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// <details> 기반 팝오버 — 네이티브 details는 바깥을 눌러도 안 닫혀서(2026-08-20 대표 요청)
// 바깥 클릭·Esc에 닫히게만 감쌌다. 서버 컴포넌트에서 summary/패널 내용을 children으로 받아
// 그대로 그리므로 링크·마크업은 호출부가 결정한다.
export default function Popover({
  summary,
  children,
  className = 'relative inline-block',
  summaryClassName = 'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
  panelClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  panelClassName?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const d = ref.current;
      if (d?.open && e.target instanceof Node && !d.contains(e.target)) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <details ref={ref} className={className}>
      <summary className={summaryClassName}>{summary}</summary>
      <div className={panelClassName}>{children}</div>
    </details>
  );
}
