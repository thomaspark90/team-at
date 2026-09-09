'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';

// 로컬 내비의 묶음(드롭다운) — 라벨 하나 아래 링크 여러 개. 2026-09-09 소프트 UI 내비 통합.
//  · 클릭으로 열고, 바깥 클릭·Esc·스크롤·경로 이동으로 닫힌다(hover 열림 없음 — 터치와 동작이 같게).
//  · 패널은 body 포털 + fixed 좌표. 내비 줄이 모바일 가로 스크롤(overflow-x:auto)이라 자식 absolute 패널이
//    세로로 잘리는 문제를 피한다(2026-09-09 배포 직후 발견).
//  · 묶음 안에 활성 링크가 있으면 라벨이 활성 표시(foreground + medium).
//  · 항목이 전부 비활성(권한 없음)이면 라벨도 흐리게, 열어도 비활성 텍스트만 보인다(왜 못 가는지 알 수 있게).
//  · 배지 = 항목 배지 합. 라벨 옆에 붙어 묶음을 안 열어도 처리할 게 있는지 보인다.

export type NavMenuItem = {
  href: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  badge?: number;
};

export const badgeClass =
  'inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-500 px-1 text-caption font-medium leading-none text-white';

export default function NavMenu({ label, items }: { label: string; items: NavMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  // 열릴 때 버튼 위치를 재서 패널을 그 아래 가운데에 놓는다. 화면 밖으로 나가면 안쪽으로 민다.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: r.left + r.width / 2, top: r.bottom + 6 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const active = items.some((i) => i.active && !i.disabled);
  const allDisabled = items.length > 0 && items.every((i) => i.disabled);
  const badge = items.reduce((n, i) => n + (i.disabled ? 0 : (i.badge ?? 0)), 0);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 whitespace-nowrap text-body transition-colors ${
          allDisabled
            ? 'cursor-not-allowed text-muted-foreground/40'
            : active
              ? 'font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={`opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {badge > 0 && <span className={badgeClass}>{badge > 999 ? '999+' : badge}</span>}
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            className="fixed z-50 -translate-x-1/2"
            style={{ left: Math.max(96, Math.min(pos.left, window.innerWidth - 96)), top: pos.top }}
          >
            <div className="min-w-[160px] rounded-md bg-background p-1.5 shadow-soft">
              {items.map((it) =>
                it.disabled ? (
                  <span
                    key={it.href}
                    role="menuitem"
                    aria-disabled="true"
                    title={it.title ? `${it.title} — 접근 권한이 없어요` : '접근 권한이 없어요'}
                    className="block cursor-not-allowed whitespace-nowrap rounded-md px-3 py-1.5 text-body text-muted-foreground/40"
                  >
                    {it.label}
                  </span>
                ) : (
                  <Link
                    key={it.href}
                    href={it.href}
                    role="menuitem"
                    title={it.title}
                    aria-current={it.active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-1.5 text-body transition-colors hover:bg-accent ${
                      it.active ? 'font-medium text-foreground' : 'text-foreground/80'
                    }`}
                  >
                    {it.label}
                    {(it.badge ?? 0) > 0 && <span className={badgeClass}>{it.badge! > 999 ? '999+' : it.badge}</span>}
                  </Link>
                ),
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
