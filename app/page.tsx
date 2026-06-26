'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem('auth') === 'ok') router.replace('/studio');
    else setTimeout(() => inputRef.current?.focus(), 100);
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      sessionStorage.setItem('auth', 'ok');
      router.push('/studio');
    } else {
      setError(true);
      setLoading(false);
    }
  };

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

        {/* 히어로 헤드라인 */}
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

        {/* 로그인 폼 */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="비밀번호를 입력하세요"
            style={{
              width: '100%',
              backgroundColor: '#F5F5F5',
              border: `1px solid ${error ? '#C0392B' : '#E5E5E5'}`,
              borderRadius: 12,
              padding: '15px 18px',
              fontSize: 15,
              color: '#000000',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = '#0099FF'; }}
            onBlur={(e) => { if (!error) e.currentTarget.style.borderColor = '#E5E5E5'; }}
          />

          {error && (
            <p style={{ fontSize: 13, color: '#C0392B', margin: '2px 2px 0' }}>비밀번호가 틀렸습니다</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: loading ? '#999999' : '#000000',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: 15,
              padding: '16px',
              borderRadius: 50,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.01em',
              marginTop: 4,
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#0099FF'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#000000'; }}
          >
            {loading ? '확인 중...' : '로그인'}
          </button>
        </form>

      </div>
    </div>
  );
}
