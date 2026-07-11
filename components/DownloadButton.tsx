'use client';

import { RefObject, useState } from 'react';
import type { StoryData } from '@/lib/types';

interface Props {
  previewRef: RefObject<HTMLDivElement | null>;
  story: StoryData;
}

const DOWNLOAD_SCALE = 3;

export default function DownloadButton({ previewRef, story }: Props) {
  const { date } = story;
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!previewRef.current) return;
    setLoading(true);

    await document.fonts.ready;

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(previewRef.current, {
      scale: DOWNLOAD_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: null,
    });

    const filename = `menu-${date.replace(/\//g, '-')}.png`;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();

    // 메뉴 아카이브 저장(+활동 로그는 서버에서) — 실패해도 다운로드를 막지 않음
    fetch('/api/staffmeals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        inputMode: story.inputMode,
        categories: story.categories,
        manualText: story.manualText,
      }),
      keepalive: true,
    }).catch(() => {});

    setLoading(false);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="ta-btn-primary tabular h-12 w-full text-[13px]"
    >
      {loading ? '이미지 생성 중...' : 'PNG 다운로드  ↓  1080 × 1920'}
    </button>
  );
}
