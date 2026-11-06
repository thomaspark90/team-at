'use client';

import { beanSourceNumber } from '@/lib/garden/bean-guide/sources';

// 인용 번호 — 누르면 접힌 출처 목록을 펼치고 그 항목으로 이동한다.
const openSources = () => document.getElementById('bean-sources')?.setAttribute('open', '');

export default function BeanCite({ ids }: { ids: string[] }) {
  return (
    <span className="whitespace-nowrap text-caption text-muted-foreground">
      {' '}
      {ids.map((id) => (
        <a key={id} href={`#bean-src-${beanSourceNumber(id)}`} onClick={openSources} className="hover:text-foreground">
          [{beanSourceNumber(id)}]
        </a>
      ))}
    </span>
  );
}
