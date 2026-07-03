import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LoginButton from '@/components/LoginButton';

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/studio');

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "Inter,'Pretendard Variable','Pretendard',sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column' }}>
        <h1
          style={{
            fontSize: 'clamp(3rem, 13vw, 4.75rem)',
            fontWeight: 900,
            lineHeight: 0.95,
            letterSpacing: '-2px',
            color: '#000000',
            margin: '0 0 40px',
          }}
        >
          team-at
        </h1>
        <LoginButton />
        <p style={{ fontSize: 13, color: '#999', marginTop: 16, textAlign: 'center' }}>
          팀 구글 계정으로 로그인하세요
        </p>
      </div>
    </div>
  );
}
