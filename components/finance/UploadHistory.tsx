'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { won } from '@/lib/finance/format';

export interface UploadRow {
  id: number;
  source: string; // bank | card | receipt
  bank: string;
  card_issuer: string | null;
  period_start: string | null;
  period_end: string | null;
  row_count: number;
  uploaded_at: string;
  settled_tx_id: number | null;
  statement_total: number | null;
}

const BANK_LABEL: Record<string, string> = { shinhan: '신한', woori: '우리' };
const fmt = (s: string | null) => (s ? s.slice(0, 10) : '');

function kind(u: UploadRow): string {
  if (u.source === 'card') return `${u.card_issuer ?? '신한'}카드 이용내역`;
  if (u.source === 'receipt') return `${u.card_issuer ?? '쿠팡'} 영수증`;
  return `${BANK_LABEL[u.bank] ?? u.bank}은행 거래내역`;
}

export default function UploadHistory({ uploads }: { uploads: UploadRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function del(u: UploadRow) {
    const extra =
      u.source === 'card'
        ? ' 연결한 통장 카드결제 건도 미분류로 되돌아가요.'
        : u.source === 'receipt'
        ? ' 원본 쿠팡 결제건이 다시 합쳐져요.'
        : '';
    if (!window.confirm(`${kind(u)} (${u.row_count}건)을 삭제할까요? 이미 분류한 내용도 함께 사라져요.${extra}`)) return;
    setBusy(u.id);
    setError(null);
    try {
      const res = await fetch('/api/finance/uploads/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: u.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '삭제에 실패했어요.');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (uploads.length === 0) {
    return (
      <div className="mx-auto my-[60px] max-w-[460px] text-center text-muted-foreground">
        <div className="mb-3 text-[32px]">🗂️</div>
        <h2 className="mb-2 text-[15px] text-foreground">아직 올린 자료가 없어요</h2>
        <p className="text-[13px]">거래 분류의 자료 보충에서 신한카드·쿠팡 자료를 올려보세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <Th>구분</Th>
                <Th>업로드</Th>
                <Th>기간</Th>
                <Th right>건수</Th>
                <Th right>금액</Th>
                <Th>상태</Th>
                <Th right>취소</Th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className="border-t border-border hover:bg-accent">
                  <Td>{kind(u)}{u.id < 0 && <span className="ml-1.5 text-[11px] text-muted-foreground">(이전 방식)</span>}</Td>
                  <Td mono muted={u.id < 0}>{u.id < 0 ? '기록 없음' : fmt(u.uploaded_at)}</Td>
                  <Td mono muted>
                    {u.period_start ? `${fmt(u.period_start)} ~ ${fmt(u.period_end)}` : '—'}
                  </Td>
                  <Td right mono>{u.row_count.toLocaleString('ko-KR')}</Td>
                  <Td right mono muted={u.statement_total == null}>
                    {u.statement_total != null ? won(u.statement_total) : '—'}
                  </Td>
                  <Td muted>
                    {u.source === 'card' ? (u.settled_tx_id ? '정산 연결됨' : '미연결') : u.source === 'receipt' ? '품목 반영' : '—'}
                  </Td>
                  <Td right>
                    <button
                      onClick={() => del(u)}
                      disabled={busy === u.id}
                      className="ta-btn h-7 px-3 text-[11px] text-destructive"
                    >
                      {busy === u.id ? '삭제 중…' : '삭제'}
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-normal ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, mono, muted }: { children: React.ReactNode; right?: boolean; mono?: boolean; muted?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 text-[13px] ${right ? 'text-right' : 'text-left'} ${mono ? 'tabular' : ''} ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{children}</td>
  );
}
