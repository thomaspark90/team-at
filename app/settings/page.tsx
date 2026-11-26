'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import Accounts from '@/components/settings/accounts/Accounts';

// 계정 관리 — admin 전용(미들웨어가 강제).
// 2026-11-26 직원 명부 통합(대표 결정): 계정 · 권한 관리는 가든 › 스케줄 › 직원 명부로 옮겼다(권한 묶음 + 명부에 없는 계정 · 계정 도구).
// 이 주소는 그 화면으로 넘긴다. 직원 명부를 열 수 없는 관리자(스케줄 운영진이 아닌 경우)에게만 예전 화면을 그대로 보여 준다 —
// 권한을 고칠 길이 막히지 않게.
export default function SettingsPage() {
  const router = useRouter();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    // 가입 신청 조회는 직원 명부와 같은 기준(운영진)으로 열리는 가벼운 API
    fetch('/api/garden-schedule/staff/signups', { cache: 'no-store' })
      .then((r) => (r.ok ? router.replace('/garden/schedule/staff?g=perm') : setFallback(true)))
      .catch(() => setFallback(true));
  }, [router]);

  return (
    <PageShell divide width="full">
      {fallback ? <Accounts /> : <p className="m-0 text-body text-muted-foreground">직원 명부로 이동하는 중…</p>}
    </PageShell>
  );
}
