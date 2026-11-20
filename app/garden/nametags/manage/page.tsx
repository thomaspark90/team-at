'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import NametagManage from '@/components/garden/nametags/NametagManage';

// 네임택 인쇄·메뉴 관리 — '네임택 인쇄·메뉴 관리' 탭 권한이 있는 계정(API 가 강제).
export default function GardenNametagsManagePage() {
  return (
    <PageShell
      nav={<GardenNav />}
      title="네임택 인쇄·메뉴 관리"
      subtitle="요청된 네임택을 일러스트 A4 문서로 만들고, 메뉴 목록을 고칩니다."
      actions={<Link href="/garden/nametags" className="text-body text-muted-foreground">‹ 네임택으로</Link>}
    >
      <NametagManage />
    </PageShell>
  );
}
