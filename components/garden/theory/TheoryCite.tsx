'use client';

import { sourceNumber } from '@/lib/garden/extraction-theory';

// 본문 인용 표시 — 번호를 누르면 접힌 출처 목록을 펼치고 그 항목으로 이동한다.
const openSources = () => document.getElementById('theory-sources')?.setAttribute('open', '');

export default function TheoryCite({ ids }: { ids: string[] }) {
  return (
    <span className="whitespace-nowrap text-caption text-muted-foreground">
      {' '}
      {ids.map((id) => (
        <a key={id} href={`#src-${sourceNumber(id)}`} onClick={openSources} className="hover:text-foreground">
          [{sourceNumber(id)}]
        </a>
      ))}
    </span>
  );
}
