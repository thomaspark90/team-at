'use client';

import { useState } from 'react';
import { weekSvg } from '@/lib/schedule/export-svg';
import type { Shift, Staff } from '@/lib/schedule/types';

// 근무표 내보내기 — PNG(카톡 단톡방용, SVG→canvas) · 인쇄/PDF(인쇄 보기). 브라우저 안에서만 만든다(서버 전송 없음).
export default function ExportMenu({ title, days, rows, shifts, store, printHref }: { title: string; days: string[]; rows: Staff[]; shifts: Shift[]; store: string; printHref: string }) {
  const [busy, setBusy] = useState(false);
  const png = async () => {
    setBusy(true);
    try {
      const svg = weekSvg({ title, days, rows, shifts, store });
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      await new Promise<void>((ok, fail) => {
        img.onload = () => ok();
        img.onerror = () => fail(new Error('그리지 못했습니다.'));
        img.src = url;
      });
      const scale = 2;
      const c = document.createElement('canvas');
      c.width = img.width * scale;
      c.height = img.height * scale;
      const ctx = c.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
      if (!blob) throw new Error('이미지를 만들지 못했습니다.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${title.replace(/[\\/:*?"<>|\s]+/g, '_')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex items-center gap-3 text-caption">
      <button type="button" className="text-muted-foreground underline underline-offset-2 hover:text-foreground" disabled={busy || rows.length === 0} onClick={png}>이미지 저장</button>
      <a href={printHref} target="_blank" rel="noreferrer" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">인쇄 · PDF</a>
    </span>
  );
}
