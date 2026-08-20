import Link from 'next/link';
import type { ExpenseGrain } from '@/lib/finance/prepExpense';

// 월 결산 페이지의 월별 손익 요약 — 전처리 빌더의 결과를 그대로 받아 표만 그린다(2026-08-20 대표 요청).
// 매출(POS·발생주의 정본)·실입금(통장)·지출(전처리1 합계)·손익(매출−지출)을 월별로.
// 계산은 전처리 화면과 같은 코드(builders)라 세 화면의 숫자가 항상 일치한다.

export interface PnlSummaryRow {
  ym: string;
  pos: number; // 전처리3/4 — POS 매출(발생)
  inTotal: number; // 전처리3 — 통장 실입금(매출 계정 순액)
  expense: number; // 전처리1 — 지출 합계(미분류·미상 포함)
  pendingExpense: number; // 전처리2 — 미분해·미분류 그룹(지출 중 아직 계정이 흐린 몫)
  /** 미분해·미분류의 구성 — 셀 클릭 시 분해해 보여주고 각 조각의 분류 화면으로 안내 */
  pending: { cardOther: number; collectedOther: number; unclassified: number; misang: number };
  /** 은행 월말 잔액(통장 표와 같은 앵커 계산) — 은행 자료 없는 달은 null */
  bankBalance: number | null;
}

export default function ClosePnlSummary({ rows, unitId }: { rows: PnlSummaryRow[]; unitId: string }) {
  const won = (n: number) => (n === 0 ? '' : n.toLocaleString());
  const grainLink = (page: string, grain: ExpenseGrain = 'month') =>
    `/finance/prep/${page}?unit=${unitId}&grain=${grain}`;
  return (
    <section className="mb-8">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h2 className="m-0 text-[15px] font-medium">월별 손익 요약</h2>
        <span className="text-[12px] text-muted-foreground">
          전처리1(지출)·전처리3(매출 대사)·전처리4(POS 정본)와 같은 계산 — 숫자가 늘 일치해요.
        </span>
      </div>
      <p className="mb-3 mt-0 text-[12px] text-muted-foreground">
        손익 = POS 매출(발생주의) − 지출 합계. <b>부가세 포함 총액</b> 기준의 간이 손익이에요 — 지표
        그래프(EBIT)는 부가세 제외 공급가액 기준이라 값은 다르지만 규칙(발생주의·카드대금 차감·미분류 포함)이
        같아 추세는 일치해요. 재고·채널수수료까지 반영한 정식 손익은{' '}
        <Link href={`/finance/pnl?unit=${unitId}`} className="underline">관리손익</Link>에서 봐요.
        실입금은 회수 참고용(카드 1~2일·식권 정산 한 달 시차). †는 POS 미업로드 달 —
        실입금 − 지출로 임시 계산한 값이라 POS 파일을 올리면 정식 손익으로 바뀌어요.
        은행 잔고는 그 달 말일 통장 잔액 — 손익과 달리 식권 선수금·대여금·투자 같은 비손익
        흐름까지 섞인 현금 상태라 손익과 나란히 보되 같다고 기대하면 안 돼요.
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[840px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="whitespace-nowrap px-3 py-2 text-left font-normal">월</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">
                <Link href={grainLink('revenue')} className="hover:text-foreground">POS 매출</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">
                <Link href={grainLink('revenue')} className="hover:text-foreground">통장 실입금</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">
                <Link href={grainLink('expense')} className="hover:text-foreground">지출 합계</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal" title="지출 중 카드 미분해·미분류·미상 — 분류가 진행되면 줄어요">
                미분해·미분류 ⓘ
              </th>
              <th className="whitespace-nowrap border-l-2 border-l-border px-3 py-2 text-right font-medium text-foreground">
                손익 (매출−지출)
              </th>
              <th
                className="whitespace-nowrap px-3 py-2 text-right font-normal"
                title="그 달 말일 통장 잔액(전 계좌 합) — 손익과 달리 선수금·대여금·투자 등 비손익 흐름까지 섞인 현금 상태예요"
              >
                <Link href={`/finance/cashflow?unit=${unitId}`} className="hover:text-foreground">은행 잔고 ⓘ</Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // POS 파일이 아직 없는 달(진행월) — 매출 0으로 두면 손익이 '−지출 전액'이라는
              // 거짓 적자가 된다(2026-08-20 보고). 실입금 − 지출로 대체하고 † 로 구분한다.
              const noPos = r.pos === 0 && r.inTotal > 0;
              const profit = noPos ? r.inTotal - r.expense : r.pos - r.expense;
              return (
                <tr key={r.ym} className="border-b border-border/50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">{r.ym}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                    {noPos ? <span className="text-muted-foreground/60">미업로드</span> : won(r.pos)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {won(r.inTotal)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{won(r.expense)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.pendingExpense === 0 ? (
                      ''
                    ) : (
                      // <details> 팝오버 — 클릭하면 "뭐가 분류 안 됐는지" 구성이 펼쳐지고,
                      // 미분류·미상·카드(분류전)는 분류 화면으로 바로 간다(전처리 드릴다운과 동일 규칙).
                      <details className="relative inline-block">
                        <summary className="cursor-pointer list-none underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                          {won(r.pendingExpense)}
                        </summary>
                        <div className="absolute right-0 z-10 mt-1 w-[300px] rounded-md border border-border bg-background p-3 text-left shadow-md">
                          <div className="mb-2 text-[12px] font-medium text-foreground">{r.ym} 미분해·미분류 구성</div>
                          <dl className="m-0 space-y-1.5 text-[12px]">
                            {r.pending.cardOther !== 0 && (
                              <div className="flex items-baseline justify-between gap-2">
                                <dt className="text-muted-foreground">카드 기타(미분해)</dt>
                                <dd className="m-0 tabular-nums">
                                  {won(r.pending.cardOther)}{' '}
                                  <Link
                                    href={`/finance/classify?unit=${unitId}&ym=${r.ym}&type=cogs&cat=${encodeURIComponent('카드 지출(분류전)')}`}
                                    className="underline hover:text-foreground"
                                    title="카드대금 인출 건들 — 표시 금액은 인출에서 네이버페이·쿠팡 수집분을 뺀 몫이라 목록 합계와는 달라요. 카드 명세를 올려 분류하면 사라져요."
                                  >
                                    보기→
                                  </Link>
                                </dd>
                              </div>
                            )}
                            {r.pending.unclassified !== 0 && (
                              <div className="flex items-baseline justify-between gap-2">
                                <dt className="text-muted-foreground">미분류</dt>
                                <dd className="m-0 tabular-nums">
                                  {won(r.pending.unclassified)}{' '}
                                  <Link
                                    href={`/finance/classify?unit=${unitId}&ym=${r.ym}&unclassified=1`}
                                    className="underline hover:text-foreground"
                                    title="아직 계정이 없는 지출 — 누르면 분류 화면에 필터된 상태로 열려요"
                                  >
                                    분류→
                                  </Link>
                                </dd>
                              </div>
                            )}
                            {r.pending.misang !== 0 && (
                              <div className="flex items-baseline justify-between gap-2">
                                <dt className="text-muted-foreground">미상</dt>
                                <dd className="m-0 tabular-nums">
                                  {won(r.pending.misang)}{' '}
                                  <Link
                                    href={`/finance/classify?unit=${unitId}&ym=${r.ym}&type=excluded&cat=${encodeURIComponent('미상')}`}
                                    className="underline hover:text-foreground"
                                    title="용도를 판단하지 못해 보류한 지출 건들"
                                  >
                                    보기→
                                  </Link>
                                </dd>
                              </div>
                            )}
                            {r.pending.collectedOther !== 0 && (
                              <div className="flex items-baseline justify-between gap-2">
                                <dt className="text-muted-foreground" title="네이버페이·쿠팡 수집분 중 설비·개인 등 비용 외 계정으로 분류된 몫 — 카드대금 차감 정합을 위해 포함돼요">
                                  기타(비용 외) ⓘ
                                </dt>
                                <dd className="m-0 tabular-nums">{won(r.pending.collectedOther)}</dd>
                              </div>
                            )}
                          </dl>
                          <div className="mt-2 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                            열 구조 그대로 보려면{' '}
                            <Link href={grainLink('expense-detail')} className="underline hover:text-foreground">
                              전처리2
                            </Link>
                            에서 이 달 행을 봐요.
                          </div>
                        </div>
                      </details>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap border-l-2 border-l-border px-3 py-1.5 text-right font-medium tabular-nums ${
                      profit < 0 ? 'text-destructive' : ''
                    }`}
                    title={noPos ? 'POS 매출 미업로드 — 통장 실입금 − 지출로 임시 계산한 값이에요' : undefined}
                  >
                    {profit < 0 ? `−${won(-profit)}` : won(profit)}
                    {noPos && <span className="ml-0.5 text-muted-foreground">†</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.bankBalance == null ? '' : won(r.bankBalance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
