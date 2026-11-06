'use client';

import { labSourceNumber } from '@/lib/garden/extraction-lab';

// 신규 출처 인용 — 번호는 기존 출처 뒤에 이어지고, 같은 접힌 출처 목록(#theory-sources)으로 이동한다.
const openSources = () => document.getElementById('theory-sources')?.setAttribute('open', '');

export default function LabCite({ ids }: { ids: string[] }) {
  return (
    <span className="whitespace-nowrap text-caption text-muted-foreground">
      {' '}
      {ids.map((id) => (
        <a key={id} href={`#src-${labSourceNumber(id)}`} onClick={openSources} className="hover:text-foreground">
          [{labSourceNumber(id)}]
        </a>
      ))}
    </span>
  );
}
