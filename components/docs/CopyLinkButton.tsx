'use client';

import { useState } from 'react';

// 공유 링크 복사 — 링크는 서버(/docs, 대표 전용)가 계산해 내려준다.
export default function CopyLinkButton({ path }: { path: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(window.location.origin + path);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button onClick={copy} className="ta-btn">
      {done ? '복사됨' : '공유 링크 복사'}
    </button>
  );
}
