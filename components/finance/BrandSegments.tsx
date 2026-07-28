import Link from 'next/link';
import { BRANDS } from '@/lib/finance/types';

// 리포트 공통 브랜드 선택기 — 전체/가든서비스/스탭밀. URL ?brand= 링크 방식(서버 컴포넌트용).
// 회계가 브랜드별로 분리(2026-07-28)되면서 모든 리포트가 같은 선택기를 쓴다.
export type BrandSeg = 'all' | 'garden' | 'staffmeal';

export const parseBrandSeg = (v: string | undefined, fallback: BrandSeg = 'all'): BrandSeg =>
  v === 'garden' || v === 'staffmeal' || v === 'all' ? v : fallback;

export default function BrandSegments({
  basePath,
  seg,
  extraParams = '',
}: {
  basePath: string;
  seg: BrandSeg;
  extraParams?: string; // 예: '&ym=2026-07' — 세그먼트 전환 시 유지할 파라미터
}) {
  const items: { id: BrandSeg; label: string }[] = [{ id: 'all', label: '전체' }, ...BRANDS];
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {items.map((s) => (
        <Link
          key={s.id}
          href={`${basePath}?brand=${s.id}${extraParams}`}
          aria-current={s.id === seg ? 'page' : undefined}
          className={`px-3 py-1.5 text-[13px] transition-colors ${
            s.id === seg ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}
