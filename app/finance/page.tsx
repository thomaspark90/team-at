import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import UploadPanel from '@/components/finance/UploadPanel';
import RequestAccessButton from '@/components/finance/RequestAccessButton';

export default async function FinancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // OWNER는 자동 admin, 그 외는 finance.members 역할
  const role = await resolveRole(supabase, user);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FAFBFC',
        fontFamily: "Inter,'Pretendard Variable','Pretendard',sans-serif",
        color: '#000000',
      }}
    >
      <TabNav />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {['admin', 'classifier'].includes(role ?? '') ? (
          <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
              <Link href="/finance/classify" style={{ fontSize: 13, color: '#0099FF', fontWeight: 600 }}>
                거래 분류 →
              </Link>
              <Link href="/finance/dashboard" style={{ fontSize: 13, color: '#0099FF', fontWeight: 600 }}>
                대시보드 →
              </Link>
              <span style={{ flex: 1 }} />
              {role === 'admin' && (
                <Link href="/finance/members" style={{ fontSize: 13, color: '#0099FF' }}>
                  멤버 관리 →
                </Link>
              )}
            </div>
            <UploadPanel />
          </>
        ) : role === 'viewer' ? (
          <ViewerNote />
        ) : (
          <NoAccess email={user.email ?? ''} />
        )}
      </div>
    </div>
  );
}

function ViewerNote() {
  return (
    <div style={{ maxWidth: 480, margin: '60px auto', background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, padding: '32px 28px', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>집계 대시보드는 준비 중이에요</h2>
      <p style={{ fontSize: 14, color: '#777', lineHeight: 1.6, margin: 0 }}>
        조회 권한으로 로그인했어요. 확정된 달의 매출·지출 그래프가 곧 여기 열려요.
      </p>
    </div>
  );
}

function NoAccess({ email }: { email: string }) {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: '60px auto',
        background: '#fff',
        border: '1px solid #E5E5E5',
        borderRadius: 12,
        padding: '32px 28px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>재무 접근 권한이 없어요</h2>
      <p style={{ fontSize: 14, color: '#777', lineHeight: 1.6, margin: 0 }}>
        재무 데이터는 관리자 승인이 필요해요.
        <br />
        아래 계정으로 <b>대표에게 권한을 요청</b>하세요.
      </p>
      <div
        style={{
          marginTop: 16,
          padding: '10px 14px',
          background: '#F5F7F9',
          borderRadius: 8,
          fontSize: 13,
          fontFamily: 'ui-monospace, Menlo, monospace',
          color: '#333',
          wordBreak: 'break-all',
        }}
      >
        {email}
      </div>
      <RequestAccessButton />
    </div>
  );
}
