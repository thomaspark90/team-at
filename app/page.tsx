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

export default function LandingPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem('auth') === 'ok') router.replace('/studio');
    else inputRef.current?.focus();
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
    <div className="min-h-screen" style={{ backgroundColor: '#FFFDF7', fontFamily: "'Pretendard Variable','Pretendard',sans-serif" }}>

      {/* ── 헤더 ── */}
      <header style={{ borderBottom: '1px solid #EDE9DC' }}>
        <div className="flex items-center mx-auto px-6" style={{ maxWidth: 1100, height: 60 }}>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center text-xs font-black"
              style={{ width: 30, height: 30, backgroundColor: '#F5C518', borderRadius: 8, color: '#1a1a1a' }}
            >
              SM
            </div>
            <span className="font-bold text-sm" style={{ color: '#1a1a1a' }}>Staff Meal</span>
          </div>
        </div>
      </header>

      {/* ── 히어로 + 암호 입력 ── */}
      <section className="mx-auto px-6 py-20 flex flex-col lg:flex-row items-center gap-16" style={{ maxWidth: 1100 }}>

        {/* 왼쪽: 텍스트 */}
        <div className="flex-1">
          <div
            className="inline-block text-xs font-semibold mb-5"
            style={{ backgroundColor: '#FFF3C4', color: '#A07800', padding: '4px 14px', borderRadius: 20 }}
          >
            인스타그램 스토리 자동 생성
          </div>
          <h1 className="font-black leading-tight mb-5" style={{ fontSize: 46, color: '#1a1a1a', lineHeight: 1.15 }}>
            매일 메뉴 스토리,<br />
            <span style={{ color: '#D4A800' }}>30초</span>면 완성
          </h1>
          <p className="leading-relaxed" style={{ fontSize: 17, color: '#6b7280' }}>
            메뉴를 입력하고 배경을 고르면<br />
            인스타그램 스토리용 이미지가 자동으로 만들어집니다.
          </p>
        </div>

        {/* 오른쪽: 암호 입력 폼 */}
        <div className="flex-shrink-0 w-full lg:w-80">
          <form
            onSubmit={handleLogin}
            style={{
              backgroundColor: '#fff',
              borderRadius: 22,
              padding: 36,
              boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
              border: '1px solid #EDE9DC',
            }}
          >
            <div
              className="flex items-center justify-center font-black text-sm mx-auto mb-4"
              style={{ width: 44, height: 44, backgroundColor: '#F5C518', borderRadius: 12, color: '#1a1a1a' }}
            >
              SM
            </div>
            <h2 className="text-center font-black mb-1" style={{ fontSize: 20, color: '#1a1a1a' }}>Staff Meal</h2>
            <p className="text-center mb-6" style={{ fontSize: 13, color: '#9ca3af' }}>팀 전용 스토리 제작 도구</p>

            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="비밀번호를 입력하세요"
              style={{
                width: '100%',
                border: `1.5px solid ${error ? '#ef4444' : '#e5e7eb'}`,
                borderRadius: 10,
                padding: '11px 14px',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 8,
                fontFamily: 'inherit',
                backgroundColor: '#FAFAF8',
              }}
            />
            {error && (
              <p className="text-center mb-2" style={{ fontSize: 12, color: '#ef4444' }}>
                비밀번호가 틀렸습니다
              </p>
            )}
            <div style={{ height: error ? 4 : 12 }} />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: '#F5C518',
                color: '#1a1a1a',
                fontWeight: 700,
                fontSize: 15,
                padding: 13,
                borderRadius: 10,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {loading ? '확인 중...' : '스토리 만들러 가기 →'}
            </button>
          </form>
        </div>
      </section>

      {/* ── 기능 소개 ── */}
      <section className="mx-auto px-6 pb-24" style={{ maxWidth: 1100 }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              style={{ backgroundColor: '#fff', border: '1px solid #EDE9DC', borderRadius: 18, padding: 28 }}
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-bold mb-2" style={{ fontSize: 16, color: '#1a1a1a' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer style={{ borderTop: '1px solid #EDE9DC', padding: '24px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>© 2026 Staff Meal · 팀 내부 전용 도구</p>
      </footer>
    </div>
  );
}
