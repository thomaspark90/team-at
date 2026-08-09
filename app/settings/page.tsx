'use client';

import TabNav from '@/components/TabNav';
import AccessControl from '@/components/settings/AccessControl';

// 계정별 페이지 접근 권한 관리 — admin 전용(미들웨어가 강제). 매장 등 나머지 계정은 나비에서도 안 보인다.
export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <AccessControl />
      </div>
    </div>
  );
}
