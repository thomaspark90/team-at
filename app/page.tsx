'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const SHADOW = '0 2px 8px rgba(0,0,0,0.06), 0 12px 40px rgba(0,0,0,0.10)';

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
        fontFamily: "'Pretendard Variable','Pretendard',sans-serif",
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: 340,
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          padding: '40px 36px',
          boxShadow: SHADOW,
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 600, color: '#B0ADA6', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 28 }}>
          Staff Meal
        </p>

        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false); }}
          placeholder="비밀번호"
          style={{
            width: '100%',
            backgroundColor: '#F8F8F8',
            border: `1px solid ${error ? '#C0392B' : '#EBEBEB'}`,
            borderRadius: 10,
            padding: '12px 14px',
            fontSize: 14,
            color: '#1C1B19',
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            marginBottom: 8,
          }}
        />
        {error && (
          <p style={{ fontSize: 12, color: '#C0392B', marginBottom: 4 }}>비밀번호가 틀렸습니다</p>
        )}
        <div style={{ height: error ? 8 : 16 }} />

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            backgroundColor: loading ? '#AAAAAA' : '#1C1B19',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: 14,
            padding: '13px',
            borderRadius: 10,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.01em',
          }}
        >
          {loading ? '확인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}
