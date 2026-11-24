'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GARDEN_TABS } from '@/lib/garden/tabs';
import { fetchMyAccess } from '@/lib/access/tab-access-client';

// 교육 묶음의 화면 전환 탭 — 교육(일정·기록) + 읽는 자료 3개(추출 이론 · 원두 이해 · 추천 레시피).
// 2026-11-24 대표 결정: '커피(필터) ▾' 묶음을 없애고 읽는 자료를 교육으로 옮겼다. 화면·주소·권한은 각자 그대로이고
// 위에 이 탭만 공통으로 둔다. 권한 없는 화면은 탭에서 빠지고, 볼 수 있는 화면이 하나뿐이면 탭을 그리지 않는다.
const KEYS = ['teaching', 'theory', 'beanguide', 'recommended'];

export default function EducationTabs() {
  const pathname = usePathname();
  const [mine, setMine] = useState<string[] | null | undefined>(undefined); // undefined = 확인 전
  useEffect(() => {
    fetchMyAccess().then((a) => setMine(a.mine ?? null));
  }, []);

  const tabs = KEYS.map((k) => GARDEN_TABS.find((t) => t.key === k)!).filter((t) => mine == null || mine.includes(t.key));
  if (mine === undefined || tabs.length < 2) return null;

  return (
    <div className="min-w-0 scrollbar-hide print:hidden" style={{ overflowX: 'auto', marginBottom: 32 }}>
      <nav aria-label="교육 화면" className="inline-flex gap-1 ta-seg" style={{ whiteSpace: 'nowrap' }}>
        {tabs.map((t) => {
          const on = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={`ta-seg-item px-3 py-1 text-body transition-colors ${on ? 'ta-seg-on' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
