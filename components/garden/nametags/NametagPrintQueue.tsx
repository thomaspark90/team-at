'use client';

import { useState } from 'react';
import { toast } from '@/components/Toast';
import { DELIVERY_OPTIONS, deliveryText, type NametagDelivery, type NametagRequest } from '@/lib/garden/nametags';
import { ACT, ACT_SUB, API, FIELD, call, choice, failed, fmtWhen, jsonInit, lineLabel, nameOf, summaryOf } from './shared';

// 프린트 요청함(그래픽 담당) — 인쇄 파일(.jsx)을 받아 일러스트에서 실행하면 A4 문서가 만들어진다.

const scriptHref = (ids: string[]) => `${API}/script?ids=${ids.join(',')}`;

export default function NametagPrintQueue({ requests, onChange }: { requests: NametagRequest[]; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  // 인쇄 완료를 누른 요청 — 전달 방법(직접 전달 / 다른 분이 전달)을 고른 뒤에 완료 알림이 나간다
  const [finishing, setFinishing] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<NametagDelivery>('direct');
  const [deliveryNote, setDeliveryNote] = useState('');
  const pending = requests.filter((r) => r.status !== 'done');
  const done = requests.filter((r) => r.status === 'done');

  const mark = async (r: NametagRequest, isDone: boolean) => {
    setBusy(r.id);
    const j = await call<{ ok: true }>(`${API}/requests`, jsonInit('PATCH', { id: r.id, done: isDone, delivery, deliveryNote }));
    setBusy(null);
    if (failed(j)) return toast(j.error, 'error');
    setFinishing(null);
    setDeliveryNote('');
    toast(isDone ? '인쇄 완료로 표시하고 요청자에게 알렸어요' : '인쇄 대기로 되돌렸어요');
    onChange();
  };

  return (
    <div className="space-y-5">
      <ol className="ta-prose m-0 list-decimal space-y-1 pl-5 text-body text-muted-foreground">
        <li>인쇄 파일 받기로 .jsx 파일을 내려받습니다.</li>
        <li>일러스트레이터 › 파일 › 스크립트 › 기타 스크립트(⌘F12)에서 받은 파일을 고릅니다.</li>
        <li>열린 A4 문서를 크기 조정 없이(100%) 인쇄하고 재단선대로 자릅니다.</li>
      </ol>

      {pending.length === 0 && <p className="text-body text-muted-foreground">대기 중인 요청이 없습니다.</p>}

      {pending.length > 1 && (
        <a className={ACT_SUB} href={scriptHref(pending.map((r) => r.id))}>
          대기 {pending.length}건 한 파일로 받기 · {summaryOf(pending.flatMap((r) => r.lines))}
        </a>
      )}

      {pending.map((r) => (
        <div key={r.id} className="space-y-2 border-t border-border pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-body font-medium">{summaryOf(r.lines)}</span>
            <span className="text-caption text-muted-foreground">
              {fmtWhen(r.createdAt)} · {nameOf(r.by)} 요청
            </span>
          </div>
          <p className="m-0 text-body">{r.lines.map(lineLabel).join(', ')}</p>
          {r.note && <p className="m-0 text-body text-muted-foreground">메모: {r.note}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
            <a className={ACT} href={scriptHref([r.id])}>
              인쇄 파일 받기
            </a>
            {finishing !== r.id && (
              <button type="button" className={ACT_SUB} onClick={() => setFinishing(r.id)}>
                인쇄 완료
              </button>
            )}
          </div>
          {finishing === r.id && (
            <div className="space-y-3 pt-3">
              <p className="m-0 text-caption text-muted-foreground">인쇄물을 어떻게 전달할까요? 요청자에게 함께 알립니다.</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {DELIVERY_OPTIONS.map((o) => (
                  <button key={o.id} type="button" className={choice(delivery === o.id)} aria-pressed={delivery === o.id} onClick={() => setDelivery(o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>
              <input
                className={`${FIELD} w-full`}
                placeholder={delivery === 'direct' ? '메모 (선택) — 예: 오후 3시쯤 가져갈게요' : '누가 전달하나요? — 예: 김매니저님 편에 보냈어요'}
                value={deliveryNote}
                maxLength={200}
                onChange={(e) => setDeliveryNote(e.target.value)}
              />
              <div className="flex gap-6">
                <button type="button" className={ACT} disabled={busy === r.id} onClick={() => mark(r, true)}>
                  완료 알리기
                </button>
                <button type="button" className={ACT_SUB} onClick={() => setFinishing(null)}>
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-body text-muted-foreground">완료한 요청 {done.length}건</summary>
          <ul className="m-0 mt-2 list-none p-0">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3">
                <div className="min-w-0">
                  <p className="m-0 text-body">
                    {fmtWhen(r.createdAt)} · {nameOf(r.by)} · {summaryOf(r.lines)}
                  </p>
                  <p className="m-0 mt-1 text-caption text-muted-foreground">{r.lines.map(lineLabel).join(', ')}</p>
                  {r.delivery && <p className="m-0 mt-1 text-caption text-muted-foreground">수령: {deliveryText(r)}</p>}
                </div>
                <div className="flex shrink-0 gap-5">
                  <a className={ACT_SUB} href={scriptHref([r.id])}>
                    다시 받기
                  </a>
                  <button type="button" className={ACT_SUB} disabled={busy === r.id} onClick={() => mark(r, false)}>
                    완료 취소
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
