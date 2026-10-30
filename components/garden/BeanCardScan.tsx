'use client';

import { useEffect, useRef, useState } from 'react';

// 원두카드 — 원두명·테이스팅 노트가 적힌 스크린샷(시트 행·메모·봉투)을 올리거나 ⌘V로 붙여넣으면
// AI(/api/garden-bean-scan, source=text)가 읽어 onResult 로 넘긴다. 카드 반영은 부모가 한다.

export interface BeanCardScanResult {
  beanName: string | null;
  roastery: string | null;
  tastingNotes: string | null;
}

export default function BeanCardScan({ onResult }: { onResult: (r: BeanCardScanResult) => string | void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const scan = async (file: File) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source', 'text');
      const res = await fetch('/api/garden-bean-scan', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '인식에 실패했어요.');
      const x = j.extraction as BeanCardScanResult;
      if (!x.beanName && !x.tastingNotes) {
        setMsg('⚠ 원두명·노트를 읽지 못했어요. 글자가 잘 보이게 다시 캡처해주세요.');
        return;
      }
      setMsg(onResult(x) || '✓ 카드에 반영했어요.');
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // 화면 어디서든 ⌘V — 클립보드에 이미지가 있을 때만 가로챈다(입력칸 글자 붙여넣기는 그대로)
  const scanRef = useRef(scan);
  scanRef.current = scan;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      scanRef.current(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="ta-btn" style={{ height: 34 }}>
        {busy ? '읽는 중…' : '스크린샷으로 채우기'}
      </button>
      <span className="text-caption text-muted-foreground">원두명·노트가 보이는 캡처를 올리거나 ⌘V로 붙여넣기</span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) scan(f);
        }}
      />
      {msg && (
        <p className="text-body text-muted-foreground" style={{ margin: 0, flexBasis: '100%' }}>
          {msg}
        </p>
      )}
    </div>
  );
}
