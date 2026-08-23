'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// 월 결산 '월별 손익 요약'의 행 드릴다운 — 손익 셀을 누르면 그 달의 관리손익 요약을
// /api/finance/pnl-month 에서 불러와 펼쳐 보여준다(2026-08-21 대표 요청).
// 계산은 관리손익 페이지와 같은 코드(lib/finance/pnlMonth)라 숫자가 항상 일치한다.
// 위 요약 표(부가세 포함 간이 손익)와 달리 여기는 공급가액(VAT 제외)·수수료 차감 기준.

export interface PnlMonthSummary {
  ym: string;
  sales: { gross: number; vat: number; supply: number };
  channelFee: { amount: number; estimated: boolean };
  netSales: number;
  cogs: { total: number; invMissing: boolean };
  grossProfit: number;
  labor: number;
  fixed: number;
  vatPayment: number;
  cardLump: number;
  payLump: { coupang: number; naverpay: number } | null;
  misang: number;
  unclassified: number;
  operatingProfit: number;
}

const won = (n: number) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR');

function Line({
  label,
  amount,
  supply,
  bold,
  muted,
  warn,
  sub,
}: {
  label: string;
  amount: number;
  /** % 분모(공급가액) — 넘기면 우측에 비율 표시 */
  supply?: number;
  bold?: boolean;
  muted?: boolean;
  warn?: boolean;
  sub?: string;
}) {
  return (
    <tr className={bold ? 'border-t border-border' : 'border-t border-border/40'}>
      <td className={`py-1 pr-3 ${bold ? 'font-medium text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground/90'}`}>
        {label}
        {sub && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{sub}</span>}
      </td>
      <td className="py-1 pr-3 text-right text-[11px] tabular-nums text-muted-foreground">
        {supply != null && supply > 0 ? ((Math.abs(amount) * 100) / supply).toFixed(1) + '%' : ''}
      </td>
      <td
        className={`py-1 text-right tabular-nums ${
          bold ? 'font-medium text-foreground' : warn ? 'text-amber-600 dark:text-amber-500' : 'text-foreground/90'
        }`}
      >
        {won(amount)}
      </td>
    </tr>
  );
}

export default function ClosePnlDrilldown({ ym, unitId, colSpan }: { ym: string; unitId: string; colSpan: number }) {
  const [data, setData] = useState<PnlMonthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/finance/pnl-month?unit=${unitId}&ym=${ym}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했어요.');
        return j as PnlMonthSummary;
      })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setError(e instanceof Error ? e.message : '불러오지 못했어요.'));
    return () => {
      alive = false;
    };
  }, [ym, unitId]);

  const s = data?.sales.supply ?? 0;
  const payLumpTotal = (data?.payLump?.coupang ?? 0) + (data?.payLump?.naverpay ?? 0);
  // 지출 합계(수수료 포함) — 공급가액 = 지출 합계 + 영업이익이라 두 %를 더하면 정확히 100%.
  // "%가 100%로 안 닫힌다"(2026-08-21 대표) 해결 — 수수료에도 %를 달고 이 줄로 전체를 닫는다.
  const expenseTotal = data
    ? data.channelFee.amount + data.cogs.total + data.labor + data.fixed + data.cardLump + payLumpTotal + data.misang + data.unclassified
    : 0;
  return (
    <tr className="border-b border-border/50 bg-muted/30">
      <td />
      <td colSpan={colSpan - 1} className="px-3 py-3">
        {error ? (
          <span className="text-[12px] text-destructive">{error}</span>
        ) : !data ? (
          <span className="text-[12px] text-muted-foreground">관리손익 불러오는 중…</span>
        ) : (
          <div className="max-w-[520px]">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-medium text-foreground">{ym} 관리손익 (부가세·수수료 제외 기준)</span>
              <Link href={`/finance/pnl?unit=${unitId}&ym=${ym}`} className="whitespace-nowrap text-[12px] underline hover:text-foreground">
                관리손익 자세히 →
              </Link>
            </div>
            {data.sales.gross === 0 && (
              <p className="mb-1.5 mt-0 text-[11px] text-amber-600">
                이 달 POS 매출이 없어(미업로드) 지출만 잡혀요 — 영업이익이 실제보다 낮게 보여요.
              </p>
            )}
            {unitId === 'pangyo' && (
              <p className="mb-1.5 mt-0 text-[11px] text-muted-foreground">
                ⓘ 판교 손익은 기여이익 성격 — 통장·카드 지출이 없고 인건비·임대료는 스탭밀 장부 귀속이라(대표 확정), 그 비용들을 빼기 전 숫자예요.
              </p>
            )}
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <Line label="총매출 (VAT 포함)" amount={data.sales.gross} muted />
                <Line label="(−) 부가세" amount={-data.sales.vat} muted />
                <Line label="공급가액 매출" amount={data.sales.supply} bold />
                <Line
                  label="(−) 채널수수료"
                  amount={-data.channelFee.amount}
                  supply={s}
                  sub={data.channelFee.estimated ? '추정' : undefined}
                />
                <Line label="순매출" amount={data.netSales} bold />
                <Line
                  label="(−) 재료비"
                  amount={-data.cogs.total}
                  supply={s}
                  sub={data.cogs.invMissing ? '기말재고 미입력 → 매입액 기준' : undefined}
                />
                <Line label="매출총이익" amount={data.grossProfit} supply={s} bold />
                <Line label="(−) 인건비" amount={-data.labor} supply={s} />
                <Line label="(−) 고정비 (판관비)" amount={-data.fixed} supply={s} />
                {data.vatPayment !== 0 && (
                  <Line label="부가세 납부 (손익 제외)" amount={data.vatPayment} muted sub="예수금 정산 — 매출에서 이미 뺀 부가세라 지출 아님" />
                )}
                {data.cardLump > 0 && (
                  <Line label="(−) 카드 지출 (미분해)" amount={-data.cardLump} supply={s} warn sub="명세 연결 시 분해" />
                )}
                {payLumpTotal > 0 && (
                  <Line label="(−) 쿠팡·네이버페이 (미분류)" amount={-payLumpTotal} supply={s} warn sub="세부 미수집" />
                )}
                {data.misang > 0 && <Line label="(−) 미상" amount={-data.misang} supply={s} warn />}
                {data.unclassified > 0 && <Line label="(−) 미분류" amount={-data.unclassified} supply={s} warn />}
                <Line label="지출 합계" amount={-expenseTotal} supply={s} muted sub="수수료 포함 — 영업이익 %와 더하면 100%" />
                <Line label="영업이익 (EBIT 근사)" amount={data.operatingProfit} supply={s} bold />
              </tbody>
            </table>
            <p className="mb-0 mt-1.5 text-[11px] text-muted-foreground">
              위 요약 표의 손익(부가세 포함 총액 기준)과 기준이 달라 값이 달라요 — 재고·수수료까지 반영한 정식 손익이에요.
            </p>
          </div>
        )}
      </td>
    </tr>
  );
}
