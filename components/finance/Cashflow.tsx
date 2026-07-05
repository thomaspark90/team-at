import type { MonthCash } from '@/lib/finance/cashflow';

const won = (n: number) => n.toLocaleString('ko-KR');
const BANK: Record<string, string> = { shinhan: '신한은행', woori: '우리은행' };
const fmtYm = (ym: string) => {
  const [y, mo] = ym.split('-');
  return `${y}년 ${Number(mo)}월`;
};

export default function Cashflow({ months }: { months: MonthCash[] }) {
  if (months.length === 0) {
    return (
      <div className="mx-auto my-[60px] max-w-[460px] text-center text-muted-foreground">
        <div className="mb-3 text-[32px]">🏦</div>
        <h2 className="mb-2 text-[18px] text-foreground">집계할 거래가 없어요</h2>
        <p className="text-[14px]">은행 내역을 업로드·저장하면 월별 통장 입출금이 여기 집계돼요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {months.map((m) => {
        const net = m.totalIn - m.totalOut;
        return (
          <div key={m.ym} className="overflow-hidden rounded-md border border-border bg-background">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border p-[14px_18px]">
              <h3 className="m-0 text-[16px] text-foreground">{fmtYm(m.ym)}</h3>
              <span className="text-[13px] text-muted-foreground">
                순증감 <b className={`tabular ${net >= 0 ? 'text-positive' : 'text-foreground'}`}>{net >= 0 ? '+' : ''}{won(net)}</b>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-muted text-muted-foreground">
                    <Th>구분</Th>
                    <Th right>입금</Th>
                    <Th right>출금</Th>
                    <Th right>순증감</Th>
                  </tr>
                </thead>
                <tbody>
                  {m.banks.map((b) => {
                    const bn = b.inflow - b.outflow;
                    return (
                      <tr key={b.bank} className="border-t border-border hover:bg-accent">
                        <Td>{BANK[b.bank] ?? b.bank}</Td>
                        <Td right mono pos>{won(b.inflow)}</Td>
                        <Td right mono>{won(b.outflow)}</Td>
                        <Td right mono><span className={bn >= 0 ? 'text-positive' : ''}>{bn >= 0 ? '+' : ''}{won(bn)}</span></Td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border bg-accent">
                    <Td bold>합계 (두 통장)</Td>
                    <Td right mono bold pos>{won(m.totalIn)}</Td>
                    <Td right mono bold>{won(m.totalOut)}</Td>
                    <Td right mono bold><span className={net >= 0 ? 'text-positive' : ''}>{net >= 0 ? '+' : ''}{won(net)}</span></Td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap p-[10px_16px] text-[11px] uppercase tracking-[0.04em] ${right ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}
function Td({ children, right, mono, bold, pos }: { children: React.ReactNode; right?: boolean; mono?: boolean; bold?: boolean; pos?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap p-[11px_16px] ${pos ? 'text-positive' : 'text-foreground'} ${right ? 'text-right' : 'text-left'} ${mono ? 'tabular font-mono' : ''} ${bold ? 'font-medium' : ''}`}
    >
      {children}
    </td>
  );
}
