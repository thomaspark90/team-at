'use client';

import { useEffect, useRef, useState } from 'react';
import type { StoryData } from '@/lib/types';
import MenuEditor from '@/components/MenuEditor';
import StoryPreview from '@/components/StoryPreview';
import DownloadButton from '@/components/DownloadButton';
import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';

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

export default function StudioMenuPage() {
  const previewRef = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [story, setStory] = useState<StoryData>(DEFAULT_STORY);

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
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <StudioNav />

      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div
          className="grid items-start gap-6"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}
        >
          {/* 왼쪽: 입력 */}
          <div className="flex min-w-0 flex-col gap-5">
            <div className="ta-card bg-background">
              <p className="ta-label">Date</p>
              <input
                type="text"
                value={story.date}
                onChange={(e) => setStory((s) => ({ ...s, date: e.target.value }))}
                className="ta-input w-[140px]"
                placeholder="예: 5/12"
              />
              <p className="mt-2 text-[11px] text-muted-foreground">배지에 표시될 날짜</p>
            </div>

            <div className="ta-card bg-background">
              <p className="ta-label">Menu</p>
              <MenuEditor story={story} onChange={setStory} />
            </div>
          </div>

          {/* 오른쪽: 미리보기 + 다운로드 */}
          <div className="sticky top-6 flex min-w-0 flex-col gap-5">
            <div className="ta-card bg-background min-w-0">
              <p className="ta-label">Preview</p>
              <div ref={previewBoxRef} className="w-full">
                <div
                  className="mx-auto overflow-hidden"
                  style={{ width: 360 * previewScale, height: 640 * previewScale }}
                >
                  <div style={{ width: 360, height: 640, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                    <StoryPreview ref={previewRef} story={story} />
                  </div>
                </div>
              </div>
            </div>

            <DownloadButton previewRef={previewRef} story={story} />

            <p className="text-center text-[11px] text-muted-foreground">
              다운로드 후 인스타그램 앱에서 스토리로 업로드하세요
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
