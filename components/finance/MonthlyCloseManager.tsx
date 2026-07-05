'use client';

import { useState } from 'react';

export interface MonthRow {
  ym: string;
  total: number;
  unclassified: number;
  status: 'open' | 'submitted' | 'confirmed';
  confirmedAt: string | null;
}

const won = (n: number) => n.toLocaleString('ko-KR');

const fmtYm = (ym: string) => {
  const [y, mo] = ym.split('-');
  return `${y}년 ${Number(mo)}월`;
};
const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export default function MonthlyCloseManager({
  months,
  canConfirm,
}: {
  months: MonthRow[];
  canConfirm: boolean;
}) {
  const [rows, setRows] = useState<MonthRow[]>(months);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(ym: string, action: 'confirm' | 'reopen') {
    if (action === 'reopen' && !window.confirm(`${fmtYm(ym)}을 다시 열까요? 확정이 해제되고 분류를 수정할 수 있어요.`)) return;
    setBusy(ym);
    setError(null);
    try {
      const res = await fetch('/api/finance/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ym, action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '처리에 실패했어요.');
      setRows((list) =>
        list.map((r) =>
          r.ym === ym
            ? { ...r, status: j.status, confirmedAt: j.confirmed_at ?? null }
            : r
        )
      );
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto my-[60px] max-w-[460px] text-center text-muted-foreground">
        <div className="mb-3 text-[32px]">📭</div>
        <h2 className="mb-2 text-[18px] text-foreground">확정할 달이 없어요</h2>
        <p className="text-[14px]">먼저 거래내역을 업로드·분류해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <Th>월</Th>
                <Th right>거래수</Th>
                <Th right>미분류</Th>
                <Th>상태</Th>
                <Th right>액션</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const confirmed = r.status === 'confirmed';
                const ready = r.unclassified === 0;
                return (
                  <tr key={r.ym} className={`border-t border-border hover:bg-accent ${confirmed ? 'bg-muted' : ''}`}>
                    <Td>{fmtYm(r.ym)}</Td>
                    <Td right mono>
                      {won(r.total)}
                    </Td>
                    <Td right mono>
                      <span className={r.unclassified ? 'text-foreground' : 'text-muted-foreground'}>
                        {won(r.unclassified)}
                      </span>
                    </Td>
                    <Td>
                      {confirmed ? (
                        <span className="text-foreground">
                          ✓ 확정{r.confirmedAt ? ` · ${fmtDate(r.confirmedAt)}` : ''}
                        </span>
                      ) : ready ? (
                        <span className="text-muted-foreground">확정 대기</span>
                      ) : (
                        <span className="text-foreground">미분류 {won(r.unclassified)}건</span>
                      )}
                    </Td>
                    <Td right>
                      {busy === r.ym ? (
                        <span className="text-[12px] text-muted-foreground">처리 중…</span>
                      ) : confirmed ? (
                        canConfirm ? (
                          <button onClick={() => act(r.ym, 'reopen')} className="ta-btn text-[13px]">
                            재오픈
                          </button>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )
                      ) : canConfirm ? (
                        <button
                          onClick={() => act(r.ym, 'confirm')}
                          disabled={!ready}
                          title={ready ? '' : '미분류를 모두 분류해야 확정할 수 있어요.'}
                          className="ta-btn-primary text-[13px]"
                        >
                          확정
                        </button>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
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
function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 align-middle text-[13px] text-foreground ${right ? 'text-right' : 'text-left'} ${mono ? 'tabular' : ''}`}
    >
      {children}
    </td>
  );
}
