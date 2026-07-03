import type { MonthCash } from '@/lib/finance/cashflow';

const won = (n: number) => n.toLocaleString('ko-KR');
const BANK: Record<string, string> = { shinhan: '신한은행', woori: '우리은행' };
const fmtYm = (ym: string) => {
  const [y, mo] = ym.split('-');
  return `${y}년 ${Number(mo)}월`;
};
const REV = '#12805c';
const EXP = '#b23b3b';

export default function Cashflow({ months }: { months: MonthCash[] }) {
  if (months.length === 0) {
    return (
      <div style={{ margin: '60px auto', maxWidth: 460, textAlign: 'center', color: '#777' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🏦</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>집계할 거래가 없어요</h2>
        <p style={{ fontSize: 14, margin: 0 }}>은행 내역을 업로드·저장하면 월별 통장 입출금이 여기 집계돼요.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {months.map((m) => {
        const net = m.totalIn - m.totalOut;
        return (
          <div key={m.ym} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{fmtYm(m.ym)}</h3>
              <span style={{ fontSize: 13, color: '#888' }}>
                순증감 <b style={{ color: net >= 0 ? REV : EXP, fontVariantNumeric: 'tabular-nums' }}>{net >= 0 ? '+' : ''}{won(net)}</b>
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 520 }}>
                <thead>
                  <tr style={{ background: '#F7F9FB', color: '#888' }}>
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
                      <tr key={b.bank} style={{ borderTop: '1px solid #EEE' }}>
                        <Td>{BANK[b.bank] ?? b.bank}</Td>
                        <Td right mono color={REV}>{won(b.inflow)}</Td>
                        <Td right mono color={EXP}>{won(b.outflow)}</Td>
                        <Td right mono color={bn >= 0 ? REV : EXP}>{bn >= 0 ? '+' : ''}{won(bn)}</Td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid #DDD', background: '#FAFBFC' }}>
                    <Td bold>합계 (두 통장)</Td>
                    <Td right mono bold color={REV}>{won(m.totalIn)}</Td>
                    <Td right mono bold color={EXP}>{won(m.totalOut)}</Td>
                    <Td right mono bold color={net >= 0 ? REV : EXP}>{net >= 0 ? '+' : ''}{won(net)}</Td>
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
  return <th style={{ textAlign: right ? 'right' : 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</th>;
}
function Td({ children, right, mono, bold, color }: { children: React.ReactNode; right?: boolean; mono?: boolean; bold?: boolean; color?: string }) {
  return (
    <td
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '11px 16px',
        color: color ?? '#333',
        fontWeight: bold ? 700 : 400,
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
        fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}
