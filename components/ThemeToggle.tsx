'use client';

import { useEffect, useState } from 'react';

// 테마 수동 선택 — 라이트/다크/시스템 3단 토글.
// 선택은 localStorage('theme')에 저장되고, 첫 페인트 적용은 app/layout.tsx 인라인 스크립트가 담당.
// '시스템'은 키를 지워 기본 동작(OS 추종)으로 되돌린다.

type Theme = 'light' | 'dark' | 'system';

const OPTIONS: { id: Theme; label: string }[] = [
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
  { id: 'system', label: '시스템' },
];

function apply(theme: Theme) {
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && sysDark));
}

export default function ThemeToggle() {
  // 서버 렌더 시점엔 localStorage를 모르므로 마운트 후에 활성 표시 (hydration 불일치 방지)
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

  return (
    <div role="radiogroup" aria-label="테마" className="flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={theme === o.id}
          onClick={() => select(o.id)}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
            theme === o.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
