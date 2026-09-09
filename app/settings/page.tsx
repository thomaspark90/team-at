'use client';

import TabNav from '@/components/TabNav';
import AccessControl from '@/components/settings/AccessControl';
import SimpleAccounts from '@/components/settings/SimpleAccounts';

// 계정별 페이지 접근 권한 관리 — admin 전용(미들웨어가 강제). 매장 등 나머지 계정은 나비에서도 안 보인다.
export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <div className="mx-auto max-w-[1100px] divide-y divide-border px-6 py-8">
        {/* 간편 계정(발급·승인·역할)이 일상 작업이라 맨 위(2026-09-09 대표 지시), 페이지 접근 권한은 아래 */}
        <div className="pb-[54px]">
          <SimpleAccounts />
        </div>
        <div className="pt-[54px]">
          <AccessControl />
        </div>
      </div>
    </div>
  );
}
