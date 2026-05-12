'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StoryData } from '@/lib/types';
import BackgroundPanel from '@/components/BackgroundPanel';
import MenuEditor from '@/components/MenuEditor';
import StoryPreview from '@/components/StoryPreview';
import DownloadButton from '@/components/DownloadButton';

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

  // 인증 확인
  useEffect(() => {
    if (sessionStorage.getItem('auth') !== 'ok') router.replace('/');
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem('auth');
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-800">Staff Meal · 스토리 메이커</h1>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          로그아웃
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* 왼쪽: 입력 패널 */}
          <div className="space-y-4">

            {/* Step 1: 배경 */}
            <section className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                ① 배경 선택
              </h2>
              <BackgroundPanel
                selected={story.backgroundUrl}
                onSelect={(url) => setStory((s) => ({ ...s, backgroundUrl: url }))}
              />
            </section>

            {/* Step 2: 날짜 */}
            <section className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                ② 날짜
              </h2>
              <input
                type="text"
                value={story.date}
                onChange={(e) => setStory((s) => ({ ...s, date: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="예: 5/12"
              />
              <p className="text-xs text-gray-400 mt-1">배지에 표시될 날짜를 입력하세요</p>
            </section>

            {/* Step 3: 메뉴 */}
            <section className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                ③ 메뉴 입력
              </h2>
              <MenuEditor story={story} onChange={setStory} />
            </section>
          </div>

          {/* 오른쪽: 미리보기 + 다운로드 */}
          <div className="space-y-4 lg:sticky lg:top-6">
            <section className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                ④ 미리보기
              </h2>
              <div className="flex justify-center overflow-x-auto">
                <StoryPreview ref={previewRef} story={story} />
              </div>
            </section>

            <DownloadButton previewRef={previewRef} date={story.date} />

            <p className="text-xs text-center text-gray-400">
              다운로드 후 인스타그램 앱에서 스토리로 업로드하세요
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
