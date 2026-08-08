'use client';

import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import TopicAssignees from '@/components/TopicAssignees';
import TodoList from '@/components/TodoList';

// 스탭밀 설정 — 가든 설정과 같은 구조로 알림 담당자·내 수신 채널과 팀 투두를 다룬다.
// 영수증에서 우리 항목에 없는 금액이 나오면 여기 지정된 담당자에게 알림이 간다.
export default function StudioSettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <StudioNav />
      {/* 카드 해체(2026-08-08) — 가든 설정과 동일하게 섹션 경계는 제목+넓은 여백으로 */}
      <div className="mx-auto max-w-[1100px] px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        <TopicAssignees
          scope="staffmeal"
          intro="스탭밀 관련 알림을 누가 받을지 정합니다. 특히 '영수증 확인 필요 금액'은 명세서에서 우리 항목에 없는 금액(할인·반품·선입금 등)이나 계산이 맞지 않는 값이 보일 때 즉시 알려주는 항목이라, 돈을 관리하는 사람을 꼭 지정해 두세요."
        />
        {/* 스탭밀 팀 투두 — 대시보드 작업 보드에 카드로도 뜬다 */}
        <TodoList
          api="/api/staffmeal-todos"
          title="스탭밀 투두리스트"
          desc="메뉴·재료·운영 등 스탭밀 관련 할 일을 팀이 함께 봅니다. 대시보드 보드에도 카드로 떠요."
          placeholder="할 일 추가 (예: 다음 주 식단 확정)"
        />
      </div>
    </div>
  );
}
