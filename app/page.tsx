'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const FEATURES = [
  {
    icon: '✏️',
    title: '메뉴만 입력하면 끝',
    desc: '카테고리별로 입력하거나 자유롭게 타이핑하면 레이아웃이 자동으로 완성됩니다.',
  },
  {
    icon: '🖼️',
    title: '고정 배경 디자인',
    desc: 'Staff Meal 브랜드 배경이 자동으로 적용됩니다.',
  },
  {
    icon: '⬇️',
    title: '1080×1920 즉시 다운로드',
    desc: '인스타그램 스토리 규격에 맞는 고화질 PNG를 바로 받아 업로드하세요.',
  },
];

const C = {
  bg: '#EDEAE3',
  surface: '#FAFAF8',
  border: '#E2DDD6',
  textPrimary: '#1C1B19',
  textSecondary: '#7C7970',
  textMuted: '#B0ADA6',
  btnBg: '#1C1B19',
  btnText: '#FFFFFF',
  inputBg: '#F5F3EF',
  inputBorder: '#DDD9D1',
};

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
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: "'Pretendard Variable','Pretendard',sans-serif", color: C.textPrimary }}>

      {/* 헤더 */}
      <header style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: C.bg }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 58, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.02em', color: C.textPrimary }}>Staff Meal</span>
        </div>
      </header>

      {/* 히어로 + 로그인 */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 60px', display: 'flex', alignItems: 'center', gap: 64, flexWrap: 'wrap' }}>

        {/* 텍스트 */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
            Instagram Story Generator
          </p>
          <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.15, marginBottom: 20, color: C.textPrimary }}>
            매일 메뉴 스토리,<br />30초면 완성
          </h1>
          <p style={{ fontSize: 16, color: C.textSecondary, lineHeight: 1.75 }}>
            메뉴를 입력하면 인스타그램 스토리용<br />이미지가 자동으로 만들어집니다.
          </p>
        </div>

        {/* 로그인 카드 */}
        <div style={{ width: 320, flexShrink: 0 }}>
          <form
            onSubmit={handleLogin}
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '36px 32px' }}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 24, textAlign: 'center' }}>
              Team Access
            </p>

            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="비밀번호"
              style={{
                width: '100%',
                backgroundColor: C.inputBg,
                border: `1px solid ${error ? '#C0392B' : C.inputBorder}`,
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: 14,
                color: C.textPrimary,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                marginBottom: 8,
              }}
            />
            {error && (
              <p style={{ fontSize: 12, color: '#C0392B', marginBottom: 8 }}>비밀번호가 틀렸습니다</p>
            )}
            <div style={{ height: error ? 8 : 16 }} />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: loading ? C.textSecondary : C.btnBg,
                color: C.btnText,
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
              {loading ? '확인 중...' : '시작하기'}
            </button>
          </form>
        </div>
      </section>

      {/* 기능 소개 */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 26px' }}
            >
              <div style={{ fontSize: 24, marginBottom: 14 }}>{f.icon}</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, marginBottom: 8 }}>{f.title}</p>
              <p style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 푸터 */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '22px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: C.textMuted }}>© 2026 Staff Meal · 팀 내부 전용 도구</p>
      </footer>
    </div>
  );
}
