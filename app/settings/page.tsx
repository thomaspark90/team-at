'use client';

import PageShell from '@/components/PageShell';
import Accounts from '@/components/settings/accounts/Accounts';

// 계정 관리 — admin 전용(미들웨어가 강제). 간편 계정·이메일 계정과 각 계정의 페이지 접근 권한을
// 한 목록에서 다룬다(2026-11-03 통합, 이전엔 '간편 계정' + '페이지 접근 권한' 두 섹션).
export default function SettingsPage() {
  return (
    <PageShell divide>
      <Accounts />
    </PageShell>
  );
}
