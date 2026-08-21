import Link from 'next/link';
import Popover from '@/components/finance/Popover';
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
  /** 손익↔잔고 다리 — 월별 요약(buildCashflowRecon)과 같은 값. 은행 자료 없는 달은 null */
  nonSalesIn: number | null; // 매출 외 입금(투자·환급·반환 등)
  nonExpenseOut: number | null; // 비용 외 출금(인테리어·보증금·대여금·투자 등)
  /** 전처리2 요약 5그룹 — 매출 대비 비용 구성 %의 분자(2026-08-20 대표 요청) */
  groups: { material: number; labor: number; rent: number; tax: number; etc: number };
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
        지출 합계 오른쪽 열들은 <b>비용 구성 %</b> — 전처리2 요약 그룹을 POS 매출 대비 비율로 본 거예요
        (호버하면 금액). 미분해 %가 크면(⚠ 5%+) 나머지 비율이 실제보다 낮게 보여요.
        실입금은 회수 참고용(카드 1~2일·식권 정산 한 달 시차). †는 POS 미업로드 달 —
        실입금 − 지출로 임시 계산한 값이라 POS 파일을 올리면 정식 손익으로 바뀌어요.
        은행 잔고는 그 달 말일 통장 잔액(진행 중인 달은 최신 거래일 기준) — 전월 잔고 + 손익과 다른 게 정상이에요(잔고 ⓘ 참고).
        매출 외 입금·비용 외 출금 두 열이 그 차이 중 시차를 뺀 몫을 그 자리에서 설명해요.
      </p>
      {/* xl 이상(표가 다 들어가는 폭)에선 overflow를 풀어 ⓘ·미분해 팝오버가 잘리지 않게 —
          overflow-x-auto 컨테이너는 overflow-y도 auto가 돼 하단 행 팝오버가 안에서 잘린다 */}
      <div className="overflow-x-auto rounded-md border border-border xl:overflow-visible">
        <table className="w-full min-w-[1280px] border-collapse text-[13px]">
          <thead>
            {/* 그룹 헤더 — 매출 축과 지출 축이 시각적으로 섞여 보인다는 지적(2026-08-21 대표)에
                따라 2단으로 구분. 비용 구성 %는 지출 합계 바로 오른쪽 열들로 배치. */}
            <tr className="border-b border-border/50 text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              <th className="px-3 py-1.5" />
              <th colSpan={2} className="border-l-2 border-l-border px-3 py-1.5 text-left font-normal">
                매출
              </th>
              <th colSpan={7} className="border-l-2 border-l-border px-3 py-1.5 text-left font-normal">
                지출 — 구성 %는 POS 매출 대비 (전처리2 그룹)
              </th>
              <th className="border-l-2 border-l-border px-3 py-1.5 text-left font-normal">손익</th>
              <th colSpan={3} className="border-l-2 border-l-border px-3 py-1.5 text-left font-normal">
                통장 (손익 밖)
              </th>
            </tr>
            <tr className="border-b border-border text-muted-foreground">
              <th className="whitespace-nowrap px-3 py-2 text-left font-normal">월</th>
              <th className="whitespace-nowrap border-l-2 border-l-border px-3 py-2 text-right font-normal">
                <Link href={grainLink('revenue')} className="hover:text-foreground">POS 매출</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">
                <Link href={grainLink('revenue')} className="hover:text-foreground">통장 실입금</Link>
              </th>
              <th className="whitespace-nowrap border-l-2 border-l-border px-3 py-2 text-right font-normal">
                <Link href={grainLink('expense')} className="hover:text-foreground">지출 합계</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal" title="원가(cogs) 전체 ÷ POS 매출 — 호버하면 금액이 보여요">
                <Link href={grainLink('expense-detail')} className="hover:text-foreground">재료비%</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal" title="정규직·단기·일일용역·퇴직금 ÷ POS 매출">
                <Link href={grainLink('expense-detail')} className="hover:text-foreground">인건비%</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal" title="임대료+관리비 ÷ POS 매출">
                <Link href={grainLink('expense-detail')} className="hover:text-foreground">임관리%</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal" title="세금과공과+보험료 ÷ POS 매출">
                <Link href={grainLink('expense-detail')} className="hover:text-foreground">세금보험%</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal" title="그 외 판관비 전부 ÷ POS 매출">
                <Link href={grainLink('expense-detail')} className="hover:text-foreground">기타%</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal" title="지출 중 카드 미분해·미분류·미상 — 분류가 진행되면 줄어요. %가 크면(⚠ 5%+) 왼쪽 비율들이 실제보다 낮게 보여요">
                미분해·미분류 ⓘ
              </th>
              <th className="whitespace-nowrap border-l-2 border-l-border px-3 py-2 text-right font-medium text-foreground">
                손익 (매출−지출)
              </th>
              <th
                className="whitespace-nowrap border-l-2 border-l-border px-3 py-2 text-right font-normal"
                title="투자·환급·반환 등 손익 밖 통장 유입 — 월별 요약과 같은 값"
              >
                <Link href={`/finance/cashflow?unit=${unitId}`} className="hover:text-foreground">매출 외 입금</Link>
              </th>
              <th
                className="whitespace-nowrap px-3 py-2 text-right font-normal"
                title="인테리어·보증금·대여금·투자 등 손익에는 안 잡히지만 통장에서 빠진 돈 — 월별 요약과 같은 값"
              >
                <Link href={`/finance/cashflow?unit=${unitId}`} className="hover:text-foreground">비용 외 출금</Link>
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">
                {/* 잔고 ≠ 전월 잔고+손익 인 이유 — 34개월 전 구간 대사로 소명한 설명(2026-08-20 대표 요청) */}
                <Popover
                  className="relative inline-block text-left font-normal"
                  summaryClassName="cursor-pointer list-none whitespace-nowrap hover:text-foreground [&::-webkit-details-marker]:hidden"
                  summary="은행 잔고 ⓘ"
                  panelClassName="absolute right-0 z-10 mt-1 w-[360px] whitespace-normal rounded-md border border-border bg-background p-3 text-[12px] font-normal leading-relaxed shadow-md"
                >
                    <div className="mb-1.5 font-medium text-foreground">은행 잔고와 손익이 다른 이유</div>
                    <p className="m-0 mb-2 text-muted-foreground">
                      그 달 말일 통장 잔액(전 계좌 합)이에요. <b className="text-foreground">전월 잔액 + 손익과 다른 게
                      정상</b>이에요 — 손익은 발생주의(판매일), 잔고는 현금이라서요. 차이는 아래 셋으로 전액
                      설명돼요(34개월 전 구간 대사 검증, 2026-08-20).
                    </p>
                    <ol className="m-0 mb-2 list-decimal space-y-1.5 pl-4 text-muted-foreground">
                      <li>
                        <b className="text-foreground">회수 시차</b> (매달 ±수백만~±1,900만) — 카드 입금 1~2일 밀림 +
                        식권대장 정산이 가끔 한 달 건너뛰어 다음 달에 두 달치가 합산 입금.
                        {unitId === 'staffmeal' && (
                          <> 예: 2025-11 +1,876만(10월 말 식권 대량판매 현금이 11월 초 입금), 2025-12 −1,025만 →
                          2026-01 +1,197만(정산 한 달 건너뜀), 2026-06 −1,556만 → 2026-07 +1,112만(같은 패턴).</>
                        )}
                      </li>
                      <li>
                        <b className="text-foreground">매출 외 입금</b> — 투자·환급·반환 등 손익 밖 유입.
                        {unitId === 'staffmeal' && (
                          <> 누적 약 +8천만: 2023-11 초기투자 3,000만, 2024-02 세무서 환급 2,365만, 2026-02
                          제일풍경채 반환 1,000만 등.</>
                        )}
                      </li>
                      <li>
                        <b className="text-foreground">비용 외 출금</b> — 손익에는 안 잡히지만 통장에서는 빠진 돈
                        (인테리어·보증금·대여금·투자).
                        {unitId === 'staffmeal' && (
                          <> 누적 약 −2.67억으로 차이의 대부분: 2023-11 인테리어+보증금 7,610만, 2025-08~09 가든
                          대여 3,596만, 2026-03~04 양재 투자 5,000만 + 김진아 상환 1억.</>
                        )}
                      </li>
                    </ol>
                    <div className="border-t border-border/50 pt-2 text-muted-foreground">
                      월별 상세 분해는{' '}
                      <Link href={`/finance/cashflow?unit=${unitId}`} className="underline hover:text-foreground">
                        월별 요약
                      </Link>
                      의 매출 외 입금·비용 외 출금 열에서 봐요.
                    </div>
                </Popover>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // POS 파일이 아직 없는 달(진행월) — 매출 0으로 두면 손익이 '−지출 전액'이라는
              // 거짓 적자가 된다(2026-08-20 보고). 실입금 − 지출로 대체하고 † 로 구분한다.
              const noPos = r.pos === 0 && r.inTotal > 0;
              const profit = noPos ? r.inTotal - r.expense : r.pos - r.expense;
              // 비용 구성 % — 분모는 POS 매출(정본). POS 없는 달은 비율이 무의미해 빈칸.
              const pctBase = noPos ? 0 : r.pos;
              const pct = (v: number) => {
                const p = (v * 100) / pctBase;
                const s = p.toFixed(1);
                return s.endsWith('.0') ? s.slice(0, -2) : s;
              };
              const pendingPct = pctBase > 0 ? (r.pendingExpense * 100) / pctBase : 0;
              const ratioItems = [
                { label: '재료비', v: r.groups.material },
                { label: '인건비', v: r.groups.labor },
                { label: '임관리', v: r.groups.rent },
                { label: '세금·보험', v: r.groups.tax },
                { label: '기타 운영비', v: r.groups.etc },
              ];
              return (
                <tr key={r.ym} className="border-b border-border/50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">{r.ym}</td>
                  <td className="whitespace-nowrap border-l-2 border-l-border px-3 py-1.5 text-right tabular-nums">
                    {noPos ? <span className="text-muted-foreground/60">미업로드</span> : won(r.pos)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {won(r.inTotal)}
                  </td>
                  <td className="whitespace-nowrap border-l-2 border-l-border px-3 py-1.5 text-right tabular-nums">{won(r.expense)}</td>
                  {ratioItems.map((it) => (
                    <td
                      key={it.label}
                      className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground"
                      title={pctBase > 0 ? `${it.label} ${it.v.toLocaleString()}원 ÷ POS 매출 ${r.pos.toLocaleString()}원` : undefined}
                    >
                      {pctBase > 0 && it.v !== 0 ? `${pct(it.v)}%` : ''}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.pendingExpense === 0 ? (
                      ''
                    ) : (
                      // <details> 팝오버 — 클릭하면 "뭐가 분류 안 됐는지" 구성이 펼쳐지고,
                      // 미분류·미상·카드(분류전)는 분류 화면으로 바로 간다(전처리 드릴다운과 동일 규칙).
                      <Popover
                        summaryClassName="cursor-pointer list-none underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden"
                        summary={won(r.pendingExpense)}
                        panelClassName="absolute right-0 z-10 mt-1 w-[300px] rounded-md border border-border bg-background p-3 text-left shadow-md"
                      >
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
                      </Popover>
                    )}
                    {r.pendingExpense !== 0 && pctBase > 0 && (
                      <span
                        className={`ml-1 text-[12px] ${pendingPct >= 5 ? 'text-amber-600' : 'text-muted-foreground/70'}`}
                        title="미분해·미분류 ÷ POS 매출 — 이 몫이 클수록 왼쪽 구성 %가 실제보다 낮게 보여요"
                      >
                        ({pct(r.pendingExpense)}%{pendingPct >= 5 && ' ⚠'})
                      </span>
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
                  <td className="whitespace-nowrap border-l-2 border-l-border px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.nonSalesIn == null ? '' : won(r.nonSalesIn)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.nonExpenseOut == null || r.nonExpenseOut === 0 ? '' : `−${won(r.nonExpenseOut)}`}
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
