'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import ReviewInbox from '@/components/garden/ReviewInbox';

export default function GardenReviewsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        {/* 페이지 제목은 내비 활성 탭이 이미 알려줘서 생략(2026-08-09) */}
        <p className="text-[13px] text-muted-foreground" style={{ margin: '0 0 20px' }}>
          톤 3종 초안 중 하나를 골라 확정하면 1시간 뒤 스마트플레이스에 등록됩니다. 그 전에는 취소하고 다시 선택할 수 있습니다.
        </p>
        <ReviewInbox />
      </div>
    </div>
  );
}
