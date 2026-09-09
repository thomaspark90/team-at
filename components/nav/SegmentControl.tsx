'use client';

import Link from 'next/link';

// 세그먼트 컨트롤 — 파인 트랙(shadow-inset) 위에 선택 칩 하나가 떠 있다(shadow-soft-sm).
// 브랜드·지점·기간처럼 "같은 화면, 다른 대상" 전환에 쓴다. 링크형(href)과 버튼형(onSelect) 둘 다 지원.

export type Segment = { id: string; label: string; href?: string };

export default function SegmentControl({
  items,
  value,
  onSelect,
  ariaLabel,
}: {
  items: Segment[];
  value: string;
  onSelect?: (id: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="ta-seg">
      {items.map((it) => {
        const on = it.id === value;
        const cls = `ta-seg-item ${on ? 'ta-seg-on' : ''}`;
        return it.href ? (
          <Link key={it.id} href={it.href} role="tab" aria-selected={on} className={cls}>
            {it.label}
          </Link>
        ) : (
          <button key={it.id} type="button" role="tab" aria-selected={on} className={cls} onClick={() => onSelect?.(it.id)}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
