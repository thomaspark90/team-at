'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import ChecklistItemManager from '@/components/garden/checklist/ChecklistItemManager';

// 체크리스트 항목 관리 — 추가·삭제·순서·사진 필수. 운영진과 '체크리스트 항목 관리' 권한이 있는 계정(API 가 강제).
export default function GardenChecklistItemsPage() {
  return (
    <PageShell
      nav={<GardenNav />}
      title="체크리스트 항목 관리"
      subtitle="바꾼 내용은 바로 저장되고 오늘 체크리스트부터 적용됩니다. 이미 제출된 기록은 바뀌지 않습니다."
      actions={<Link href="/garden/checklist" className="text-body text-muted-foreground">‹ 체크리스트로</Link>}
    >
      <ChecklistItemManager />
    </PageShell>
  );
}
