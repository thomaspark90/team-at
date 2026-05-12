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
    title: '배경은 골라서 쓰세요',
    desc: '미리 올려둔 배경 이미지 중 오늘 분위기에 맞는 걸 클릭 한 번으로 선택합니다.',
  },
  {
    icon: '⬇️',
    title: '1080×1920 즉시 다운로드',
    desc: '인스타그램 스토리 규격에 맞는 고화질 PNG를 바로 받아 업로드하세요.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem('auth') === 'ok') router.replace('/studio');
  }, [router]);

  useEffect(() => {
    if (showModal) setTimeout(() => inputRef.current?.focus(), 50);
  }, [showModal]);

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

  const closeModal = () => {
    setShowModal(false);
    setPassword('');
    setError(false);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFDF7', fontFamily: "'Pretendard Variable','Pretendard',sans-serif" }}>

      {/* ── 헤더 ── */}
      <header style={{ borderBottom: '1px solid #EDE9DC' }}>
        <div className="flex items-center justify-between mx-auto px-6" style={{ maxWidth: 1100, height: 60 }}>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center text-xs font-black"
              style={{ width: 30, height: 30, backgroundColor: '#F5C518', borderRadius: 8, color: '#1a1a1a' }}
            >
              SM
            </div>
            <span className="font-bold text-sm" style={{ color: '#1a1a1a' }}>Staff Meal</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="text-sm font-semibold transition"
            style={{ backgroundColor: '#1a1a1a', color: '#fff', padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer' }}
          >
            스토리 만들기
          </button>
        </div>
      </header>

      {/* ── 히어로 ── */}
      <section className="mx-auto px-6 py-20 flex flex-col lg:flex-row items-center gap-16" style={{ maxWidth: 1100 }}>
        {/* 텍스트 */}
        <div className="flex-1">
          <div
            className="inline-block text-xs font-semibold mb-5"
            style={{ backgroundColor: '#FFF3C4', color: '#A07800', padding: '4px 14px', borderRadius: 20 }}
          >
            인스타그램 스토리 자동 생성
          </div>
          <h1 className="font-black leading-tight mb-5" style={{ fontSize: 48, color: '#1a1a1a', lineHeight: 1.15 }}>
            매일 메뉴 스토리,<br />
            <span style={{ color: '#D4A800' }}>30초</span>면 완성
          </h1>
          <p className="mb-10 leading-relaxed" style={{ fontSize: 17, color: '#6b7280' }}>
            메뉴를 입력하고 배경을 고르면<br />
            인스타그램 스토리용 이미지가 자동으로 만들어집니다.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="font-bold transition hover:opacity-90"
            style={{ backgroundColor: '#F5C518', color: '#1a1a1a', fontSize: 15, padding: '14px 30px', borderRadius: 14, border: 'none', cursor: 'pointer' }}
          >
            스토리 만들러 가기 →
          </button>
        </div>

        {/* 스토리 목업 */}
        <div className="flex-shrink-0 flex items-center justify-center">
          <StoryMockup />
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

      {/* ── 비밀번호 모달 ── */}
      {showModal && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100 }}
          onClick={closeModal}
        >
          <form
            onSubmit={handleLogin}
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#fff',
              borderRadius: 22,
              padding: 40,
              width: 320,
              boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
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
              placeholder="비밀번호"
              style={{
                width: '100%',
                border: `1.5px solid ${error ? '#ef4444' : '#e5e7eb'}`,
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 8,
                fontFamily: 'inherit',
              }}
            />
            {error && (
              <p className="text-center mb-3" style={{ fontSize: 12, color: '#ef4444' }}>
                비밀번호가 틀렸습니다
              </p>
            )}
            <div style={{ height: error ? 0 : 8 }} />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: '#F5C518',
                color: '#1a1a1a',
                fontWeight: 700,
                fontSize: 14,
                padding: 12,
                borderRadius: 10,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {loading ? '확인 중...' : '입장하기'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function StoryMockup() {
  return (
    <div
      style={{
        width: 210,
        height: 373,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: '#fdf8ee',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)',
        border: '1px solid #e8e2d0',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* 날짜 배지 */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#F5C518',
          borderRadius: 6,
          padding: '6px 14px',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 9, color: '#1a1a1a', letterSpacing: '0.07em' }}>
          5/12 TODAY&apos;S MENU
        </span>
      </div>

      {/* 메뉴 */}
      <div
        style={{
          position: 'absolute',
          top: 72,
          left: 0,
          right: 0,
          bottom: 64,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '0 16px',
        }}
      >
        {[
          { cat: '샐러드', items: ['폴렌타 스프', '구운가지 샐러드', '요거트 과일 샐러드'] },
          { cat: '탄수화물', items: ['버섯 알리오 올리오', '스탭밀 하프 버거', '깍두기 볶음밥'] },
          { cat: '육류', items: ['그릴드 목살', '점보 닭다리', '삼겹살'] },
        ].map((section) => (
          <div key={section.cat} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 8, fontWeight: 700, color: '#1a1a1a', marginBottom: 2 }}>
              [{section.cat}]
            </p>
            {section.items.map((item) => (
              <p key={item} style={{ fontSize: 7.5, color: '#1a1a1a', lineHeight: 1.85 }}>{item}</p>
            ))}
          </div>
        ))}
      </div>

      {/* 하단 고정 영역 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 60,
          backgroundColor: '#f0ead8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 7, fontWeight: 800, color: '#8a7a5a', letterSpacing: '0.12em' }}>
          STAFF MEAL
        </span>
      </div>
    </div>
  );
}
