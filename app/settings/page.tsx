'use client';

import PageShell from '@/components/PageShell';
import AccessControl from '@/components/settings/AccessControl';
import SimpleAccounts from '@/components/settings/SimpleAccounts';

// 계정별 페이지 접근 권한 관리 — admin 전용(미들웨어가 강제). 매장 등 나머지 계정은 나비에서도 안 보인다.
export default function SettingsPage() {
  return (
    <PageShell divide>
      {/* 간편 계정(발급·승인·역할)이 일상 작업이라 맨 위(2026-09-09 대표 지시), 페이지 접근 권한은 아래 */}
      <div className="pb-[54px]">
        <SimpleAccounts />
      </div>
      <div className="pt-[54px]">
        <AccessControl />
      </div>
    </PageShell>
  );
}
