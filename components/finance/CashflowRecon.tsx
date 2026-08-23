import Link from 'next/link';
import type { CashflowRecon } from '@/lib/finance/cashflowRecon';
import { bankShort } from '@/lib/finance/cashflow';
import { fmtYm } from '@/lib/finance/format';

// 월별 요약 대사 표 — 행=월, 열은 통장 / 매출 대사(전처리3) / 지출 대사(전처리1) 세 그룹.
// 값은 전처리 빌더 결과를 그대로 붙인 것이라 전처리 화면과 항상 같은 숫자가 나온다.

const won = (n: number | null) => (n == null ? '—' : n === 0 ? '' : n.toLocaleString('ko-KR'));

interface ColDef {
  key: string;
  label: string;
  hint?: string;
  muted?: boolean; // 파생·설명 성격의 열은 톤을 낮춘다
}

// 통장 그룹은 계좌 수에 따라 렌더 시점에 만든다 — 계좌 2개 이상(가든 양재)이면 잔액을
// 계좌별 열로 분해하고 '합산' 열을 붙인다(2026-08-23 그릴 확정). 1개면 기존과 동일.
const bankGroup = (banks: string[]): { label: string; href?: (unit: string) => string; cols: ColDef[] } => ({
  label: '통장 (현금흐름)',
  cols: [
    { key: 'bankIn', label: '입금' },
    { key: 'bankOut', label: '출금' },
    { key: 'net', label: '순증감' },
    ...(banks.length >= 2
      ? banks.map((b) => ({
          key: `bal:${b}`,
          label: `잔액 · ${bankShort(b)}`,
          hint: `${bankShort(b)} 계좌의 월말 잔액(거래 없는 달은 직전 잔액 이월).`,
        }))
      : []),
    { key: 'balance', label: banks.length >= 2 ? '잔액 합산' : '월말 잔액' },
  ],
});

const GROUPS: { label: string; href?: (unit: string) => string; cols: ColDef[] }[] = [
  {
    label: '매출 대사 — 전처리3',
    href: (unit) => `/finance/prep/revenue?unit=${unit}`,
    cols: [
      {
        key: 'posSales',
        label: 'POS 매출 (정본)',
        hint: '판매일 기준 매출(발생주의) — 월 성과 평가는 이 열이 정본이에요.',
      },
      {
        key: 'giftSale',
        label: '자가 식권 판매',
        muted: true,
        hint: '자가 식권(선불) 판매 — 선수금이라 POS 매출엔 없지만 돈은 카드로 바로 들어와요. 매출 입금이 POS보다 큰 주 원인이에요.',
      },
      {
        key: 'salesIn',
        label: '매출 입금',
        hint: '매출 계정으로 분류된 통장 입금 순액 — 전처리3의 통장 입금 합계와 같은 값이에요.',
      },
      {
        key: 'mealTicket',
        label: '식권 정산 (전월분)',
        muted: true,
        hint: '식권대장·올리브식권 정산 — 지난달 장사값이 이번 달 중순에 들어온 거예요. POS와 입금이 다른 주원인.',
      },
      {
        key: 'rateAdj',
        label: '보정 정산률 %',
        muted: true,
        hint: '식권 정산을 장사한 달(전월)로 되돌린 입금÷POS — 90~105% 밖이면 ⚠. 최신 1~2개월은 정산 대기라 낮은 게 정상이에요.',
      },
      {
        key: 'nonSalesIn',
        label: '매출 외 입금',
        muted: true,
        hint: '통장 입금 중 매출 계정이 아닌 몫 — 투자·대여 회수, 지원금, 이자 같은 돈이에요. 통장 입금이 POS보다 커 보이는 또 다른 이유.',
      },
    ],
  },
  {
    label: '지출 대사 — 전처리1',
    href: (unit) => `/finance/prep/expense?unit=${unit}`,
    cols: [
      {
        key: 'expenseTotal',
        label: '지출 합계 (비용)',
        hint: '전처리1 월 뷰의 지출 합계 — 카드대금에서 수집분을 뺀 실제 비용이에요(미분류·미상 포함, 관리손익과 동일 규칙).',
      },
      {
        key: 'nonExpenseOut',
        label: '비용 외 출금',
        muted: true,
        hint: '통장에서 나갔지만 비용이 아닌 몫 — 대여금·투자금·카드대금정산·개인 등으로 분류된 출금이에요. 통장 출금이 지출 합계보다 큰 달은 대개 이 열 때문이에요.',
      },
    ],
  },
];

export default function CashflowReconTable({ recon, unitId }: { recon: CashflowRecon; unitId: string }) {
  const { months, warnings } = recon;
  const groups = [bankGroup(recon.banks ?? []), ...GROUPS];
  const warnByYm = new Map<string, string[]>();
  for (const w of warnings) {
    const arr = warnByYm.get(w.bucket) ?? [];
    arr.push(w.message);
    warnByYm.set(w.bucket, arr);
  }

  return (
    <div>
      {warnings.length > 0 && (
        <ul className="mb-5 flex list-none flex-col gap-1 rounded-md border border-border bg-card/40 p-3 text-[12px] text-muted-foreground">
          {warnings.map((w, i) => (
            <li key={`${w.bucket}-${i}`}>
              <b className="tabular-nums text-foreground">{w.bucket}</b> — {w.message}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-auto rounded-md border border-border">
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border/50 text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              <th className="sticky left-0 z-20 bg-card px-3 py-1.5" />
              {groups.map((g) => (
                <th key={g.label} colSpan={g.cols.length} className="border-l-2 border-l-border px-3 py-1.5 text-left font-normal">
                  {g.href ? (
                    <Link href={g.href(unitId)} className="transition-colors hover:text-foreground">
                      {g.label} ↗
                    </Link>
                  ) : (
                    g.label
                  )}
                </th>
              ))}
            </tr>
            <tr className="border-b border-border text-muted-foreground">
              <th className="sticky left-0 z-20 whitespace-nowrap bg-card px-3 py-2 text-left font-normal">월</th>
              {groups.flatMap((g) =>
                g.cols.map((c, i) => (
                  <th
                    key={c.key}
                    title={c.hint}
                    className={`whitespace-nowrap px-3 py-2 text-right font-normal ${i === 0 ? 'border-l-2 border-l-border' : ''} ${
                      c.muted ? 'text-muted-foreground/70' : ''
                    }`}
                  >
                    {c.label}
                    {c.hint && <span className="ml-1 text-muted-foreground/50">ⓘ</span>}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              // 은행 누락 경고는 구간으로 묶여 있어 월 키로는 안 잡힌다 — 행 표식은 플래그로
              const warns = warnByYm.get(m.ym) ?? (m.bankMissing ? ['이 달 은행 자료가 없어요.'] : undefined);
              return (
                <tr key={m.ym} className="border-b border-border/50 last:border-0">
                  <td
                    className="sticky left-0 z-10 whitespace-nowrap bg-background px-3 py-1.5 tabular-nums"
                    title={warns?.join('\n')}
                  >
                    {warns && <span>⚠ </span>}
                    {fmtYm(m.ym)}
                  </td>
                  {groups.flatMap((g) =>
                    g.cols.map((c, i) => {
                      const v = c.key.startsWith('bal:')
                        ? (m.bankBalances?.find((b) => b.bank === c.key.slice(4))?.balance ?? null)
                        : (m[c.key as keyof typeof m] as number | null);
                      const display =
                        c.key === 'rateAdj' ? (v == null || v === 0 ? '' : `${v.toLocaleString('ko-KR')}%`) : won(v);
                      const signed = c.key === 'net' && v != null && v !== 0;
                      return (
                        <td
                          key={c.key}
                          className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                            i === 0 ? 'border-l-2 border-l-border' : ''
                          } ${c.muted ? 'text-muted-foreground' : ''} ${signed && v! > 0 ? 'text-positive' : ''}`}
                        >
                          {signed && v! > 0 ? `+${display}` : display}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-1 text-[12px] text-muted-foreground">
        {groups.flatMap((g) => g.cols)
          .filter((c) => c.hint)
          .map((c) => (
            <p key={c.key} className="m-0">
              <b className="text-foreground">{c.label}</b> — {c.hint}
            </p>
          ))}
      </div>
    </div>
  );
}
