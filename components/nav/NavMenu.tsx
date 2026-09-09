'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// 로컬 내비의 묶음(드롭다운) — 라벨 하나 아래 링크 여러 개. 2026-09-09 소프트 UI 내비 통합.
//  · 클릭으로 열고, 바깥 클릭·Esc·경로 이동으로 닫힌다. 데스크톱은 hover 로도 열린다.
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
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = items.some((i) => i.active && !i.disabled);
  const allDisabled = items.length > 0 && items.every((i) => i.disabled);
  const badge = items.reduce((n, i) => n + (i.disabled ? 0 : (i.badge ?? 0)), 0);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => window.matchMedia('(hover: hover)').matches && setOpen(true)}
      onMouseLeave={() => window.matchMedia('(hover: hover)').matches && setOpen(false)}
    >
      <button
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
      {open && (
        <div
          role="menu"
          // pt-2 로 버튼과 패널 사이 hover 공백을 메운다(마우스가 내려가다 닫히는 것 방지)
          className="absolute left-1/2 top-full z-40 -translate-x-1/2 pt-2"
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
        </div>
      )}
    </div>
  );
}
