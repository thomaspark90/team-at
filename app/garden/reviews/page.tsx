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
          수집된 리뷰의 AI 초안을 확인·수정하고 승인하면, 다음 게시 주기에 스마트플레이스에 등록됩니다.
        </p>
        <ReviewInbox />
      </div>
    </div>
  );
}
