'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StoryData } from '@/lib/types';
import MenuEditor from '@/components/MenuEditor';
import StoryPreview from '@/components/StoryPreview';
import DownloadButton from '@/components/DownloadButton';

const C = {
  bg: '#EDEAE3',
  surface: '#FAFAF8',
  border: '#E2DDD6',
  textPrimary: '#1C1B19',
  textSecondary: '#7C7970',
  textMuted: '#B0ADA6',
};

const DEFAULT_STORY: StoryData = {
  date: (() => {
    const d = new Date();
    return `${d.getMonth() + 1}/${d.getDate()}`;
  })(),
  backgroundUrl: '',
  inputMode: 'fixed',
  categories: [
    { name: '샐러드', items: ['', '', ''] },
    { name: '탄수화물', items: ['', '', ''] },
    { name: '육류', items: ['', '', '', ''] },
  ],
  manualText: '',
};

export default function StudioPage() {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);
  const [story, setStory] = useState<StoryData>(DEFAULT_STORY);

  useEffect(() => {
    if (sessionStorage.getItem('auth') !== 'ok') router.replace('/');
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem('auth');
    router.push('/');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: "'Pretendard Variable','Pretendard',sans-serif", color: C.textPrimary }}>

      {/* 헤더 */}
      <header style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.02em' }}>Staff Meal</span>
          <button
            onClick={handleLogout}
            style={{ fontSize: 12, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            로그아웃
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

          {/* 왼쪽: 입력 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 날짜 */}
            <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px 28px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                Date
              </p>
              <input
                type="text"
                value={story.date}
                onChange={(e) => setStory((s) => ({ ...s, date: e.target.value }))}
                style={{
                  border: `1px solid #DDD9D1`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 14,
                  width: 140,
                  backgroundColor: '#F5F3EF',
                  color: C.textPrimary,
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                placeholder="예: 5/12"
              />
              <p style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>배지에 표시될 날짜</p>
            </div>

            {/* 메뉴 */}
            <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px 28px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                Menu
              </p>
              <MenuEditor story={story} onChange={setStory} />
            </div>
          </div>

          {/* 오른쪽: 미리보기 + 다운로드 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>
            <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px 28px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                Preview
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
                <StoryPreview ref={previewRef} story={story} />
              </div>
            </div>

            <DownloadButton previewRef={previewRef} date={story.date} />

            <p style={{ fontSize: 12, color: C.textMuted, textAlign: 'center' }}>
              다운로드 후 인스타그램 앱에서 스토리로 업로드하세요
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
