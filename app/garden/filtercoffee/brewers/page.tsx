'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import BrewerSettings from '@/components/garden/BrewerSettings';

// 필터커피 내리는 사람 편집 — 설정 화면의 같은 구역을 필터커피 아래에서도 연다(2026-11-26).
// 서브 매니저 이상은 설정 탭 권한이 없어도 여기서 고친다. 화면 접근은 경로상 '필터커피(recipes)' 탭, 수정 권한은 API 가 판정.
export default function GardenBrewersPage() {
  return (
    <PageShell nav={<GardenNav />}>
      <div className="min-w-0">
        <Link href="/garden/filtercoffee" className="text-body text-muted-foreground underline hover:text-foreground">
          ← 필터커피
        </Link>
        <BrewerSettings standalone />
      </div>
    </PageShell>
  );
}
