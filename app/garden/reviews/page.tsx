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
        <h1 className="text-[15px] font-medium" style={{ margin: '0 0 4px' }}>
          네이버 리뷰 답글
        </h1>
        <p className="text-[13px] text-muted-foreground" style={{ margin: '0 0 20px' }}>
          톤 3종 초안 중 하나를 골라 확정하면 1시간 뒤 스마트플레이스에 등록됩니다. 그 전에는 취소하고 다시 선택할 수 있습니다.
        </p>
        <ReviewInbox />
      </div>
    </div>
  );
}
