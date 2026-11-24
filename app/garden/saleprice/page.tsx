'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenSalePrice from '@/components/garden/GardenSalePrice';
import { fetchMyAccess } from '@/lib/access/tab-access-client';

// 판매가 설정 — 2026-11-24 원두 장부(/garden/recipes) 줄 펼침의 '판매가'로 합쳤다. 이 주소(알림 메일·푸시 링크)로 들어오면 장부로 넘긴다.
// 장부(recipes) 권한 없이 판매가 권한만 있는 계정에는 예전 책정 화면을 그대로 보여준다(넘기면 내비가 다시 돌려보낸다).
export default function GardenSalePricePage() {
  const router = useRouter();
  const [legacy, setLegacy] = useState(false);

  useEffect(() => {
    fetchMyAccess().then((a) => {
      if (a.mine == null || a.mine.includes('recipes')) router.replace('/garden/recipes');
      else setLegacy(true);
    });
  }, [router]);

  return (
    <PageShell nav={<GardenNav />} width="wide">
      {legacy ? <GardenSalePrice /> : null}
    </PageShell>
  );
}
