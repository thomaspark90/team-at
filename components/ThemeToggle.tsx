'use client';

import { useEffect, useRef, useState } from 'react';

// 테마 수동 선택 — 헤더에선 버튼 하나 + 드롭다운(라이트/다크/시스템)로 공간을 아낀다(2026-08-08).
// 모바일 햄버거 메뉴 안에서는 인라인 3단 선택(ThemeOptions)을 쓴다 — 패널 안은 공간 여유가 있다.
// 선택은 localStorage('theme')에 저장되고, 첫 페인트 적용은 app/layout.tsx 인라인 스크립트가 담당.
// '시스템'은 키를 지워 기본 동작(OS 추종)으로 되돌린다.

type Theme = 'light' | 'dark' | 'system';

const OPTIONS: { id: Theme; label: string }[] = [
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
  { id: 'system', label: '시스템' },
];

const ICONS: Record<Theme, JSX.Element> = {
  light: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  ),
  system: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8m-4-3v3" />
    </svg>
  ),
};

function apply(theme: Theme) {
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && sysDark));
}

// 공유 훅 — 드롭다운(헤더)과 인라인 선택(햄버거 메뉴)이 같은 저장·적용 로직을 쓴다.
// 서버 렌더 시점엔 localStorage를 모르므로 마운트 후에 활성 표시 (hydration 불일치 방지)
function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    setTheme(stored === 'light' || stored === 'dark' ? stored : 'system');
  }, []);

  const select = (t: Theme) => {
    setTheme(t);
    if (t === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', t);
    apply(t);
  };
  return { theme, select };
}

// 인라인 3단 선택 — 모바일 햄버거 메뉴 등 공간 여유가 있는 곳에서 사용
export function ThemeOptions() {
  const { theme, select } = useTheme();
  return (
    <div role="radiogroup" aria-label="테마" className="flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={theme === o.id}
          onClick={() => select(o.id)}
          className={`rounded px-2 py-1 text-[12px] transition-colors ${
            theme === o.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 헤더용 — 현재 테마 아이콘 버튼 하나, 누르면 드롭다운으로 선택
export default function ThemeToggle() {
  const { theme, select } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭·ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.id === theme) ?? OPTIONS[2];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`테마: ${current.label} (눌러서 변경)`}
        className="flex h-7 items-center gap-1 rounded-md border border-border px-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        {ICONS[theme ?? 'system']}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="테마 선택"
          className="absolute right-0 top-full z-50 mt-1 min-w-[112px] rounded-md border border-border bg-background py-1 shadow-md"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={theme === o.id}
              onClick={() => {
                select(o.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-colors ${
                theme === o.id ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {ICONS[o.id]}
              {o.label}
              {theme === o.id && <span className="ml-auto">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
