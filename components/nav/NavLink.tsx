'use client';

import Link from 'next/link';
import { badgeClass } from './NavMenu';

// 로컬 내비의 단일 링크. 활성 = foreground + medium, 비활성(권한 없음) = 흐린 텍스트로 자리는 유지.
export default function NavLink({
  href,
  label,
  active,
  disabled,
  title,
  badge = 0,
}: {
  href: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  badge?: number;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        title={title ? `${title} — 접근 권한이 없어요` : '접근 권한이 없어요'}
        className="cursor-not-allowed whitespace-nowrap text-body text-muted-foreground/40"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-1 whitespace-nowrap text-body transition-colors ${
        active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      {badge > 0 && <span className={badgeClass}>{badge > 999 ? '999+' : badge}</span>}
    </Link>
  );
}
