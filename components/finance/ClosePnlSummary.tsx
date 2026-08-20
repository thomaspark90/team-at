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
        손익 = POS 매출(발생주의) − 지출 합계. 부가세 포함 총액 기준의 간이 손익이라, 재고·채널수수료를
        반영한 정식 손익은 <Link href={`/finance/pnl?unit=${unitId}`} className="underline">관리손익</Link>에서 봐요.
        실입금은 회수 참고용(카드 1~2일·식권 정산 한 달 시차).
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const profit = r.pos - r.expense;
              return (
                <tr key={r.ym} className="border-b border-border/50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">{r.ym}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{won(r.pos)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {won(r.inTotal)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{won(r.expense)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {won(r.pendingExpense)}
                  </td>
                  <td
                    className={`whitespace-nowrap border-l-2 border-l-border px-3 py-1.5 text-right font-medium tabular-nums ${
                      profit < 0 ? 'text-destructive' : ''
                    }`}
                  >
                    {profit < 0 ? `−${won(-profit)}` : won(profit)}
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
