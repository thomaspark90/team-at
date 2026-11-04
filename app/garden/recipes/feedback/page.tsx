'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import BrewFeedbackReview from '@/components/garden/BrewFeedbackReview';

// 추출 평가 모아보기 — 레시피 보드에서 남긴 의견 전체. 권한은 경로상 '필터 레시피(recipes)' 탭에 묶인다.
export default function GardenBrewFeedbackPage() {
  return (
    <PageShell nav={<GardenNav />}>
      <BrewFeedbackReview />
    </PageShell>
  );
}
