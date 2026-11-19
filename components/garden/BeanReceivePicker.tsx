'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import { matchScanToPending, receiveTodo, type ReceiveTarget } from '@/lib/garden/receive';

// 작업 보드 [원두 수령] — 지점을 고르고, 받은 봉투를 찍으면 그 지점의 수령 대기 발주 중 어느 것인지 찾아
// 수령 창(BeanReceiveDialog)으로 넘긴다 (2026-11-19 대표 지시).
// 사진으로 못 찾으면 목록에서 직접 고른다 — 찍어서 읽은 영문명·로스팅 날짜는 그대로 들고 간다.
// 지점이 기록되지 않은 옛 발주는 두 지점 모두에 보인다.

type ScanResult = { beanName: string | null; beanNameEn: string | null; roastery: string | null; roastDate: string | null };

export default function BeanReceivePicker({
  targets,
  onPick,
  onClose,
}: {
  targets: ReceiveTarget[];
  onPick: (target: ReceiveTarget, initial?: { beanEn?: string | null; roastDate?: string | null }) => void;
  onClose: () => void;
}) {
  // 기본 지점 — 이 기기의 지점 선택(레시피 탭·발주 화면과 같은 localStorage 키)
  const [store, setStore] = useState<StoreId>('yangjae');
  useEffect(() => {
    try {
      if (localStorage.getItem('garden-board-store') === 'pangyo') setStore('pangyo');
    } catch {
      /* 저장소 접근 불가 — 기본값 유지 */
    }
  }, []);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<ScanResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const pending = useMemo(() => targets.filter((t) => !t.store || t.store === store), [targets, store]);
  const initialOf = (s: ScanResult | null) => (s ? { beanEn: s.beanNameEn, roastDate: s.roastDate } : undefined);

  const scan = async (file: File) => {
    setScanning(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/garden-bean-scan', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '인식에 실패했어요.');
      const x = j.extraction as ScanResult;
      const hit = matchScanToPending(x, pending);
      if (hit) {
        onPick(hit, initialOf(x));
        return;
      }
      setScanned(x);
      setMsg(
        `${x.beanNameEn ?? x.beanName ?? '봉투'} — 어느 발주인지 못 찾았어요. 아래에서 받은 원두를 골라 주세요${
          x.beanNameEn ? ' (읽은 영문명은 그대로 가져가요)' : ''
        }.`
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="원두 수령"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
    >
      <div
        className="ta-card bg-background max-h-[92vh] w-full overflow-y-auto rounded-t-2xl sm:max-w-[420px] sm:rounded-md"
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        <div>
          <p className="ta-label" style={{ margin: 0 }}>원두 수령</p>
          <p className="text-body text-muted-foreground" style={{ margin: '4px 0 0' }}>
            어느 지점에서 받았는지 고르고, 받은 봉투를 찍어 주세요.
          </p>
        </div>

        <div className="ta-seg" style={{ display: 'flex' }}>
          {STORES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setStore(s.id); setMsg(null); }}
              className={`ta-seg-item ${store === s.id ? 'ta-seg-on' : ''}`}
              style={{ flex: 1, padding: '8px 0' }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {pending.length === 0 ? (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            이 지점에 수령 대기 중인 발주가 없어요.
          </p>
        ) : (
          <>
            <label
              className="ta-btn-primary w-full"
              style={{ cursor: scanning ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {scanning ? '봉투를 읽는 중…' : '📷 받은 봉투 찍기'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                disabled={scanning}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) scan(file);
                }}
              />
            </label>

            {msg && <p className="text-caption text-foreground" style={{ margin: 0 }}>{msg}</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="text-caption text-muted-foreground">수령 대기 {pending.length}건 — 눌러서 직접 고를 수도 있어요</span>
              <div className="divide-y divide-border" style={{ display: 'flex', flexDirection: 'column' }}>
                {pending.map((t) => {
                  const todo = receiveTodo(t);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onPick(t, initialOf(scanned))}
                      disabled={scanning}
                      style={{ background: 'none', border: 0, padding: '10px 0', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}
                    >
                      <span className="text-body font-medium text-foreground">{t.bean}</span>
                      {t.roastery && <span className="text-caption text-muted-foreground">{t.roastery}</span>}
                      <span style={{ flex: 1 }} />
                      <span className="text-caption text-muted-foreground">
                        {todo.roastDate ? '수령 전' : todo.beanEn ? '영문명 확정 전' : '원두카드 요청 전'} ›
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <button onClick={onClose} className="ta-btn w-full">
          닫기
        </button>
      </div>
    </div>
  );
}
