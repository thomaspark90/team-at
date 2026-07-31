'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface SourceStatus {
  total: number;
  unclassified: number;
  byBank: Record<string, number>;
}
interface Status {
  sources: Record<'bank' | 'card' | 'naverpay', SourceStatus>;
  closeStatus: 'open' | 'submitted' | 'confirmed';
}

// 업로드 보드와 같은 시각 언어: 할 일 있는 타일은 점선·클릭, 끝난 타일은 ✓·취소선·흐림.
const TILES: { key: 'bank' | 'card' | 'naverpay'; label: string }[] = [
  { key: 'bank', label: '은행 입출금' },
  { key: 'card', label: '카드 지출' },
  { key: 'naverpay', label: '네이버 페이 지출' },
];
const BANK_LABEL: Record<string, string> = { shinhan: '신한', woori: '우리', naverpay: '네이버 페이', coupang: '쿠팡', excel: '엑셀' };

const fmtYm = (ym: string) => `${ym.split('-')[0]}년 ${Number(ym.split('-')[1])}월`;

// 지출 자료 분류 보드 — 월별로 출처별 미분류가 얼마나 남았는지 To-do 로 보여주고,
// 타일 클릭 시 지출 자료 분류 화면을 해당 월·출처·미분류만으로 필터해 연다. 끝은 월 확정.
// 기준 월(ym)은 대시보드 상단 공용 월 선택(AccountingBoards)에서 내려받는다.
export default function ClassifyBoard({ ym }: { ym: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    try {
      const res = await fetch(`/api/finance/classify/status?ym=${target}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '상태를 불러오지 못했어요.');
      setStatus(j as Status);
      setError(null);
    } catch (e) {
      setStatus(null);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setStatus(null);
    load(ym);
  }, [ym, load]);

  const totalUncl = status
    ? TILES.reduce((s, t) => s + status.sources[t.key].unclassified, 0)
    : 0;
  const totalRows = status ? TILES.reduce((s, t) => s + status.sources[t.key].total, 0) : 0;
  const confirmed = status?.closeStatus === 'confirmed';
  const allClassified = status != null && totalRows > 0 && totalUncl === 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[15px] font-medium">
          지출 자료 분류
          {status && totalRows > 0 && (
            <span className={`ml-2 text-[12px] font-normal ${totalUncl === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {totalUncl === 0 ? '모두 분류됨' : `미분류 ${totalUncl}건`}
            </span>
          )}
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        올린 자료의 거래마다 계정을 지정하는 작업이에요. 칸을 누르면 그 출처의 미분류만 모아서 열려요.
        미분류가 0이 되면 월 확정을 할 수 있어요.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {TILES.map((t) => {
          const s = status?.sources[t.key];
          // 자료 없음 → 중립, 미분류 있음 → 할 일(점선), 모두 분류 → 완료(✓)
          if (!status) {
            return (
              <div key={t.key} className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] text-muted-foreground">
                {t.label} <span className="text-[12px]">— 확인 중…</span>
              </div>
            );
          }
          if (!s || s.total === 0) {
            return (
              <div key={t.key} className="rounded-xl border border-border bg-background px-3.5 py-2.5 opacity-50">
                <span className="text-[13px]">{t.label}</span>
                <span className="ml-2 text-[12px] text-muted-foreground">자료 없음</span>
              </div>
            );
          }
          if (s.unclassified === 0) {
            return (
              <div key={t.key} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 opacity-70">
                <span className="flex items-center gap-2 text-[13px]">
                  <span className="text-emerald-600">✓</span>
                  <span className="text-muted-foreground line-through">{t.label}</span>
                </span>
                <span className="text-[11px] text-muted-foreground">{s.total}건 완료</span>
              </div>
            );
          }
          const detail =
            t.key === 'bank'
              ? Object.entries(s.byBank)
                  .map(([b, n]) => `${BANK_LABEL[b] ?? b} ${n}`)
                  .join(' · ')
              : `${s.total}건 중`;
          return (
            <Link
              key={t.key}
              href={`/finance/classify?ym=${ym}&source=${t.key}&unclassified=1`}
              className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-background px-3.5 py-2.5 transition-colors hover:border-foreground/40"
            >
              <span className="text-[13px] font-medium">{t.label}</span>
              <span className="text-right text-[12px]">
                <span className="font-medium text-amber-600">미분류 {s.unclassified}건</span>
                <span className="block text-[11px] text-muted-foreground">{detail}</span>
              </span>
            </Link>
          );
        })}
      </div>

      {/* 마지막 단계 — 월 확정 */}
      {status && (
        <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 ${confirmed ? 'border-border bg-muted/40 opacity-70' : 'border-border bg-background'}`}>
          <span className="flex items-center gap-2 text-[13px]">
            <span className={confirmed ? 'text-emerald-600' : 'text-muted-foreground'}>{confirmed ? '✓' : '•'}</span>
            <span className={confirmed ? 'text-muted-foreground line-through' : ''}>
              {confirmed
                ? `${fmtYm(ym)} 확정됨`
                : totalRows === 0
                  ? `${fmtYm(ym)} 자료가 아직 없어요`
                  : allClassified
                    ? `${fmtYm(ym)} 확정 가능 — 미분류 0건`
                    : `${fmtYm(ym)} 확정하려면 미분류 ${totalUncl}건 처리 필요`}
            </span>
          </span>
          {!confirmed && totalRows > 0 && (
            <Link
              href={allClassified ? '/finance/close' : `/finance/classify?ym=${ym}&unclassified=1`}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${allClassified ? 'bg-foreground text-background' : 'border border-border text-muted-foreground hover:text-foreground'}`}
            >
              {allClassified ? '월 확정하러 가기 →' : '분류하러 가기 →'}
            </Link>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
    </section>
  );
}
