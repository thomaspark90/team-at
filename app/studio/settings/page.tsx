'use client';

import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import TopicAssignees from '@/components/TopicAssignees';

// 스탭밀 설정 — 가든 설정과 같은 구조로 알림 담당자·내 수신 채널만 다룬다.
// 영수증에서 우리 항목에 없는 금액이 나오면 여기 지정된 담당자에게 알림이 간다.
export default function StudioSettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <StudioNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <TopicAssignees
          scope="staffmeal"
          intro="스탭밀 관련 알림을 누가 받을지 정합니다. 특히 '영수증 확인 필요 금액'은 명세서에서 우리 항목에 없는 금액(할인·반품·선입금 등)이나 계산이 맞지 않는 값이 보일 때 즉시 알려주는 항목이라, 돈을 관리하는 사람을 꼭 지정해 두세요."
        />
      </div>
    </div>
  );
}
