'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// 필터커피 화면 윗줄의 「내리는 사람」 링크 — 명단을 고칠 수 있는 사람(대표 · 설정 권한 · 서브 매니저 이상)에게만 보인다.
// 권한 판정은 서버가 한다(/api/garden-brewers?check=1). 설정 화면에 못 들어가는 매니저도 여기로 편집 화면에 들어간다.
export default function BrewerEditLink() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    fetch('/api/garden-brewers?check=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAllowed(!!j?.allowed))
      .catch(() => setAllowed(false));
  }, []);
  if (!allowed) return null;
  return (
    <Link href="/garden/filtercoffee/brewers" className="fc-go" title="필터커피 라인업의 이름 버튼에 나오는 사람 고르기">
      내리는 사람
    </Link>
  );
}
