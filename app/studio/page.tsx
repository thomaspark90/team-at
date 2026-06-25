'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StoryData } from '@/lib/types';
import MenuEditor from '@/components/MenuEditor';
import StoryPreview from '@/components/StoryPreview';
import DownloadButton from '@/components/DownloadButton';
import TabNav from '@/components/TabNav';

const SHADOW = '0 1px 3px rgba(0,0,0,0.05)';

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
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [story, setStory] = useState<StoryData>(DEFAULT_STORY);

  useEffect(() => {
    if (sessionStorage.getItem('auth') !== 'ok') router.replace('/');
  }, [router]);

  // 미리보기(360px 고정)를 컬럼 폭에 맞춰 축소 — ref 요소는 그대로라 다운로드는 1080×1920 유지
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const update = () => setPreviewScale(Math.min(1, el.clientWidth / 360));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FFFFFF', fontFamily: "Inter,'Pretendard Variable','Pretendard',sans-serif", color: '#000000' }}>

      <TabNav />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 24, alignItems: 'start' }}>

          {/* 왼쪽: 입력 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

            {/* 날짜 */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: '24px 28px', border: '1px solid #E5E5E5', boxShadow: SHADOW }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#999999', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                Date
              </p>
              <input
                type="text"
                value={story.date}
                onChange={(e) => setStory((s) => ({ ...s, date: e.target.value }))}
                style={{
                  border: '1px solid #E5E5E5',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 14,
                  width: 140,
                  backgroundColor: '#F5F5F5',
                  color: '#000000',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                placeholder="예: 5/12"
              />
              <p style={{ fontSize: 12, color: '#999999', marginTop: 8 }}>배지에 표시될 날짜</p>
            </div>

            {/* 메뉴 */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: '24px 28px', border: '1px solid #E5E5E5', boxShadow: SHADOW }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#999999', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                Menu
              </p>
              <MenuEditor story={story} onChange={setStory} />
            </div>
          </div>

          {/* 오른쪽: 미리보기 + 다운로드 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 24, minWidth: 0 }}>
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: '24px 28px', border: '1px solid #E5E5E5', boxShadow: SHADOW, minWidth: 0, boxSizing: 'border-box' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#999999', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                Preview
              </p>
              <div ref={previewBoxRef} style={{ width: '100%' }}>
                <div style={{ width: 360 * previewScale, height: 640 * previewScale, margin: '0 auto', overflow: 'hidden' }}>
                  <div style={{ width: 360, height: 640, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                    <StoryPreview ref={previewRef} story={story} />
                  </div>
                </div>
              </div>
            </div>

            <DownloadButton previewRef={previewRef} date={story.date} />

            <p style={{ fontSize: 12, color: '#999999', textAlign: 'center' }}>
              다운로드 후 인스타그램 앱에서 스토리로 업로드하세요
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
