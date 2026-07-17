'use client';

import { useState } from 'react';
import Link from 'next/link';
import { wonNum as won, fmtYm } from '@/lib/finance/format';
import { UPLOAD_SLOTS, type SlotStatus } from '@/lib/finance/uploadSlots';

export interface MonthRow {
  ym: string;
  total: number;
  unclassified: number;
  status: 'open' | 'submitted' | 'confirmed';
  confirmedAt: string | null;
}

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
  // 확정 게이트 — 업로드가 덜 된 달을 확정하려 하면 체크리스트로 한 번 더 확인
  const [gate, setGate] = useState<{ ym: string; issues: string[] } | null>(null);

  // 확정 전 커버리지 점검 — 슬롯별 업로드 상태를 확인해 빠진/부분 슬롯을 나열
  async function requestConfirm(ym: string) {
    setBusy(ym);
    setError(null);
    try {
      const res = await fetch(`/api/finance/excel/status?ym=${ym}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '업로드 현황 확인 실패');
      const slots = j.slots as Record<string, SlotStatus>;
      const issues = UPLOAD_SLOTS.flatMap((s) => {
        const st = slots[s.key];
        if (!st?.done) return [`${s.label} — 업로드 안 됨`];
        if (!st.full) return [`${s.label} — ${st.range ?? '일부'} 구간만 올라옴 (부분)`];
        return [];
      });
      setBusy(null);
      if (issues.length === 0) return act(ym, 'confirm');
      setGate({ ym, issues });
    } catch {
      // 점검 실패가 확정을 영영 막으면 안 됨 — 재래식 확인으로 폴백
      setBusy(null);
      if (window.confirm(`${fmtYm(ym)} 업로드 현황을 확인하지 못했어요. 그래도 확정할까요?`)) act(ym, 'confirm');
    }
  }

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
        <h2 className="mb-2 text-[15px] text-foreground">확정할 달이 없어요</h2>
        <p className="text-[13px]">먼저 거래내역을 업로드·분류해주세요.</p>
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
                        <span className="text-[11px] text-muted-foreground">처리 중…</span>
                      ) : confirmed ? (
                        canConfirm ? (
                          <button onClick={() => act(r.ym, 'reopen')} className="ta-btn text-[13px]">
                            재오픈
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )
                      ) : !ready ? (
                        <Link href={`/finance/classify?ym=${r.ym}&unclassified=1`} className="ta-btn text-[13px]">
                          미분류 분류 →
                        </Link>
                      ) : canConfirm ? (
                        <button onClick={() => requestConfirm(r.ym)} className="ta-btn-primary text-[13px]">
                          확정
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 확정 게이트 — 빠졌거나 부분인 업로드가 있는 달을 확정하기 전 마지막 확인 */}
      {gate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setGate(null)}>
          <div className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 text-[15px] font-medium">⚠ {fmtYm(gate.ym)} 자료가 아직 덜 올라왔어요</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              지금 확정하면 아래 자료가 빠진 채로 그 달 손익이 잠겨요. 회계 대시보드에서 마저 올린 뒤
              확정하는 걸 권해요.
            </p>
            <ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
              {gate.issues.map((msg) => (
                <li key={msg} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px]">
                  {msg}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <Link
                href="/dashboard"
                className="flex-[2] rounded-xl bg-foreground py-2.5 text-center text-[14px] font-medium text-background"
              >
                업로드 보드로 가기
              </Link>
              <button
                onClick={() => {
                  const ym = gate.ym;
                  setGate(null);
                  act(ym, 'confirm');
                }}
                className="flex-1 rounded-xl border border-border py-2.5 text-[14px] text-muted-foreground hover:text-foreground"
              >
                그래도 확정
              </button>
            </div>
          </div>
        </div>
      )}
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
