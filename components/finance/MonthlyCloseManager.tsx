'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { wonNum as won, fmtYm } from '@/lib/finance/format';
import { slotsForBanks, type SlotStatus } from '@/lib/finance/uploadSlots';
import { useMonthCtx } from './MonthShell';

export interface MonthRow {
  ym: string;
  total: number;
  unclassified: number;
  unassigned?: number; // 가든 지점 단위 전용 — 지점 미지정 가든 거래 수(0이어야 확정 가능)
  status: 'open' | 'submitted' | 'confirmed';
  confirmedAt: string | null;
}

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export default function MonthlyCloseManager({
  months,
  canConfirm,
  unit = 'yangjae',
  brand = 'garden',
}: {
  months: MonthRow[];
  canConfirm: boolean;
  unit?: 'staffmeal' | 'yangjae' | 'pangyo'; // 확정 3단위 — 페이지의 단위 탭이 내려줌
  brand?: 'garden' | 'staffmeal'; // 업로드 현황 점검용(은행·카드는 브랜드 공용)
}) {
  const [rows, setRows] = useState<MonthRow[]>(months);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 확정 게이트 — 업로드가 덜 된 달을 확정하려 하면 체크리스트로 한 번 더 확인
  const [gate, setGate] = useState<{ ym: string; issues: string[] } | null>(null);
  // 일괄 확정(2026-08-03) — 확정 대기 달을 골라 한 번에. 진행 상황·자료 미비 달은 별도 게이트로
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null); // 진행 문구
  const [bulkGate, setBulkGate] = useState<{ ym: string; issues: string[] }[] | null>(null);
  // 결산값 패널 — 확정 달의 '결산 확인'을 누르면 결산값과 현재 계산의 차이를 보여준다(유연 모드)
  type SnapState = {
    loading: boolean;
    error?: string;
    snapshot?: { version: number; createdAt: string } | null;
    diffs?: { label: string; was: number; now: number }[];
  };
  const [snaps, setSnaps] = useState<Record<string, SnapState>>({});
  async function loadSnap(ym: string) {
    setSnaps((m) => ({ ...m, [ym]: { loading: true } }));
    try {
      const res = await fetch(`/api/finance/close/snapshot?ym=${ym}&unit=${unit}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '결산값 조회 실패');
      setSnaps((m) => ({ ...m, [ym]: { loading: false, snapshot: j.snapshot, diffs: j.diffs ?? [] } }));
    } catch (e) {
      setSnaps((m) => ({ ...m, [ym]: { loading: false, error: (e as Error).message } }));
    }
  }
  async function resnap(ym: string) {
    setSnaps((m) => ({ ...m, [ym]: { ...(m[ym] ?? { loading: false }), loading: true } }));
    try {
      const res = await fetch('/api/finance/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ym, unit, action: 'resnap' }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '재결산 실패');
      await loadSnap(ym); // 새 버전 기준으로 차이 재계산(이제 0이어야 정상)
    } catch (e) {
      setSnaps((m) => ({ ...m, [ym]: { loading: false, error: (e as Error).message } }));
    }
  }

  // 좌측 연·월 사이드바(MonthShell) 선택 달 — 표에서 그 달 행을 하이라이트하고 화면에 보이게
  const ctx = useMonthCtx();
  const selYm = ctx?.ym ?? null;
  useEffect(() => {
    if (selYm) document.getElementById(`close-${selYm}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selYm]);

  // 커버리지 점검 — 슬롯별 업로드 상태를 확인해 빠진/부분 슬롯을 나열. 실패 시 null(판정 불가)
  async function checkIssues(ym: string): Promise<string[] | null> {
    try {
      const res = await fetch(`/api/finance/excel/status?ym=${ym}&brand=${brand}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '업로드 현황 확인 실패');
      const slots = j.slots as Record<string, SlotStatus>;
      // 사용 은행 설정 반영 — 이 브랜드가 안 쓰는 은행 슬롯은 확정 점검에서 요구하지 않는다
      return slotsForBanks((j.banks as string[] | undefined) ?? null).flatMap((s) => {
        const st = slots[s.key];
        if (!st?.done) return [`${s.label} — 업로드 안 됨`];
        if (!st.full) return [`${s.label} — ${st.range ?? '일부'} 구간만 올라옴 (부분)`];
        return [];
      });
    } catch {
      return null;
    }
  }

  // 확정 전 커버리지 점검 — 빠진 자료가 있으면 게이트로 한 번 더 확인
  async function requestConfirm(ym: string) {
    setBusy(ym);
    setError(null);
    const issues = await checkIssues(ym);
    setBusy(null);
    if (issues === null) {
      // 점검 실패가 확정을 영영 막으면 안 됨 — 재래식 확인으로 폴백
      if (window.confirm(`${fmtYm(ym)} 업로드 현황을 확인하지 못했어요. 그래도 확정할까요?`)) act(ym, 'confirm');
      return;
    }
    if (issues.length === 0) return void act(ym, 'confirm');
    setGate({ ym, issues });
  }

  async function act(ym: string, action: 'confirm' | 'reopen'): Promise<boolean> {
    if (action === 'reopen' && !window.confirm(`${fmtYm(ym)}을 다시 열까요? 확정이 해제되고 분류를 수정할 수 있어요.`)) return false;
    setBusy(ym);
    setError(null);
    try {
      const res = await fetch('/api/finance/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ym, action, unit }),
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
      setBusy(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
      return false;
    }
  }

  // 일괄 확정 — 선택한 달을 과거→최신 순으로 점검·확정. 자료가 덜 올라온 달은 건너뛰고
  // 마지막에 모아 보여준 뒤(bulkGate) 원하면 그것까지 확정한다.
  async function bulkConfirm(targets?: string[]) {
    const yms = (targets ?? Array.from(selected)).sort();
    if (yms.length === 0) return;
    setError(null);
    const skipped: { ym: string; issues: string[] }[] = [];
    let done = 0;
    for (let i = 0; i < yms.length; i++) {
      const ym = yms[i];
      setBulkBusy(`${i + 1}/${yms.length} — ${fmtYm(ym)} 처리 중…`);
      if (!targets) {
        const issues = await checkIssues(ym);
        if (issues === null || issues.length > 0) {
          skipped.push({ ym, issues: issues ?? ['업로드 현황을 확인하지 못했어요'] });
          continue;
        }
      }
      if (await act(ym, 'confirm')) {
        done++;
        setSelected((s) => {
          const n = new Set(s);
          n.delete(ym);
          return n;
        });
      }
    }
    setBulkBusy(done > 0 ? `✓ ${done}개월 확정 완료${skipped.length ? ` · ${skipped.length}개월 보류` : ''}` : null);
    if (skipped.length > 0) setBulkGate(skipped);
  }

  // 일괄 확정 대상 = 미확정 + 미분류 0 + 지점 미지정 0
  const eligible = rows.filter((r) => r.status !== 'confirmed' && r.unclassified === 0 && (r.unassigned ?? 0) === 0);
  const allSelected = eligible.length > 0 && eligible.every((r) => selected.has(r.ym));

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
    <div className="flex flex-col gap-6">
      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}

      {/* 일괄 확정 툴바 — 확정 대기(미분류 0) 달을 골라 한 번에 */}
      {canConfirm && eligible.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-[13px]">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(eligible.map((r) => r.ym)) : new Set())}
            />
            확정 대기 전체 선택 ({eligible.length}개월)
          </label>
          <button
            onClick={() => bulkConfirm()}
            disabled={selected.size === 0 || !!bulkBusy?.includes('처리 중')}
            className="ta-btn-primary text-[13px]"
          >
            선택 {selected.size}개월 일괄 확정
          </button>
          {bulkBusy && <span className="text-muted-foreground">{bulkBusy}</span>}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                {canConfirm && <th className="w-8 px-2 py-2" aria-label="선택" />}
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
                const unassigned = r.unassigned ?? 0;
                const ready = r.unclassified === 0 && unassigned === 0;
                return (
                  <React.Fragment key={r.ym}>
                  <tr
                    id={`close-${r.ym}`}
                    className={`border-t border-border hover:bg-accent ${
                      r.ym === selYm ? 'bg-primary/10' : confirmed ? 'bg-muted' : ''
                    }`}
                  >
                    {canConfirm && (
                      <td className="px-2 py-2 text-center">
                        {!confirmed && ready && (
                          <input
                            type="checkbox"
                            checked={selected.has(r.ym)}
                            onChange={(e) =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(r.ym);
                                else n.delete(r.ym);
                                return n;
                              })
                            }
                            aria-label={`${fmtYm(r.ym)} 선택`}
                          />
                        )}
                      </td>
                    )}
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
                        <span className="text-foreground">
                          {r.unclassified > 0 && `미분류 ${won(r.unclassified)}건`}
                          {r.unclassified > 0 && unassigned > 0 && ' · '}
                          {unassigned > 0 && `지점 미지정 ${won(unassigned)}건`}
                        </span>
                      )}
                    </Td>
                    <Td right>
                      {busy === r.ym ? (
                        <span className="text-[11px] text-muted-foreground">처리 중…</span>
                      ) : confirmed ? (
                        <span className="inline-flex items-center gap-1.5">
                          <button onClick={() => (snaps[r.ym] ? setSnaps((m) => { const n = { ...m }; delete n[r.ym]; return n; }) : loadSnap(r.ym))} className="ta-btn text-[13px]">
                            {snaps[r.ym] ? '결산 닫기' : '결산 확인'}
                          </button>
                          {canConfirm && (
                            <button onClick={() => act(r.ym, 'reopen')} className="ta-btn text-[13px]">
                              재오픈
                            </button>
                          )}
                        </span>
                      ) : !ready ? (
                        <Link
                          href={
                            r.unclassified > 0
                              ? `/finance/classify?ym=${r.ym}&unclassified=1`
                              : `/finance/classify?ym=${r.ym}&brand=garden&store=none`
                          }
                          className="ta-btn text-[13px]"
                        >
                          {r.unclassified > 0 ? '미분류 분류 →' : '지점 지정 →'}
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
                  {snaps[r.ym] && (
                    <tr className="border-t border-border/40 bg-muted/30">
                      <td colSpan={canConfirm ? 6 : 5} className="px-4 py-3 text-[12px]">
                        {(() => {
                          const sn = snaps[r.ym]!;
                          if (sn.loading) return <span className="text-muted-foreground">결산값 확인 중…</span>;
                          if (sn.error) return <span className="text-destructive">{sn.error}</span>;
                          if (!sn.snapshot)
                            return (
                              <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                                이 달엔 저장된 결산값이 없어요(결산값 도입 전에 확정된 달이에요).
                                {canConfirm && (
                                  <button onClick={() => resnap(r.ym)} className="ta-btn text-[12px]">
                                    지금 결산값 만들기
                                  </button>
                                )}
                              </span>
                            );
                          if (!sn.diffs || sn.diffs.length === 0)
                            return (
                              <span className="text-muted-foreground">
                                ✓ 현재 집계가 결산값(v{sn.snapshot.version} · {sn.snapshot.createdAt.slice(0, 10)})과
                                정확히 일치해요.
                              </span>
                            );
                          return (
                            <div className="flex flex-col gap-1.5">
                              <span className="font-medium text-foreground">
                                ⚠ 결산(v{sn.snapshot.version} · {sn.snapshot.createdAt.slice(0, 10)}) 후 숫자가
                                바뀌었어요 — 재분류·재업로드가 있었던 거예요.
                              </span>
                              <ul className="m-0 flex list-none flex-col gap-0.5 p-0 tabular-nums text-muted-foreground">
                                {sn.diffs.slice(0, 8).map((d) => (
                                  <li key={d.label}>
                                    {d.label}: {won(d.was)} → <b className="text-foreground">{won(d.now)}</b> (
                                    {d.now - d.was > 0 ? '+' : ''}
                                    {won(d.now - d.was)})
                                  </li>
                                ))}
                                {sn.diffs.length > 8 && <li>… 외 {sn.diffs.length - 8}건</li>}
                              </ul>
                              {canConfirm && (
                                <span className="flex items-center gap-2">
                                  <button onClick={() => resnap(r.ym)} className="ta-btn-primary text-[12px]">
                                    이 숫자로 재결산
                                  </button>
                                  <span className="text-muted-foreground">
                                    변경이 잘못된 거라면 분류 화면에서 되돌린 뒤 다시 확인하세요.
                                  </span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 일괄 확정 보류 게이트 — 자료가 덜 올라와 건너뛴 달 목록 + 강행 옵션 */}
      {bulkGate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setBulkGate(null)}
        >
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:max-w-[480px] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 text-[15px] font-medium">⚠ 자료가 덜 올라온 {bulkGate.length}개월은 보류했어요</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              지금 확정하면 아래 자료가 빠진 채로 그 달 손익이 잠겨요. 자료 입력에서 마저 올린 뒤 다시 일괄
              확정하는 걸 권해요.
            </p>
            <ul className="mt-3 flex max-h-[300px] list-none flex-col gap-1.5 overflow-y-auto p-0">
              {bulkGate.map((g) => (
                <li key={g.ym} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px]">
                  <b>{fmtYm(g.ym)}</b> — {g.issues.join(' · ')}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setBulkGate(null)}
                className="flex-[2] rounded-xl bg-foreground py-2.5 text-[13px] font-medium text-background"
              >
                자료 마저 올리고 확정할게요
              </button>
              <button
                onClick={() => {
                  const yms = bulkGate.map((g) => g.ym);
                  setBulkGate(null);
                  bulkConfirm(yms);
                }}
                className="flex-1 rounded-xl border border-border py-2.5 text-[13px] text-muted-foreground hover:text-foreground"
              >
                그래도 확정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 확정 게이트 — 빠졌거나 부분인 업로드가 있는 달을 확정하기 전 마지막 확인 */}
      {gate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setGate(null)}
        >
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:max-w-[440px] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
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
                className="flex-[2] rounded-xl bg-foreground py-2.5 text-center text-[13px] font-medium text-background"
              >
                업로드 보드로 가기
              </Link>
              <button
                onClick={() => {
                  const ym = gate.ym;
                  setGate(null);
                  act(ym, 'confirm');
                }}
                className="flex-1 rounded-xl border border-border py-2.5 text-[13px] text-muted-foreground hover:text-foreground"
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
