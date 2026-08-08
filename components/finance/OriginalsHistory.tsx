'use client';

export interface OriginalRow {
  id: number;
  area: string;
  filename: string;
  content_type: string | null;
  size: number | null;
  ym: string | null;
  brand: string | null;
  store: string | null;
  note: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string;
}

// area 태그 → 화면 표시용 구분 라벨(lib/finance/original-archive.ts 의 area 규약과 짝을 맞춘다)
function areaLabel(area: string): string {
  if (area.startsWith('pos-')) return 'POS 매출리포트';
  if (area.startsWith('bank-excel-')) return '통장 거래내역(엑셀)';
  if (area.startsWith('bank-pdf-')) return '통장 거래내역(PDF)';
  if (area.startsWith('card-')) return '카드 이용내역';
  if (area === 'receipt-coupang') return '쿠팡 영수증';
  if (area === 'bean-scan') return '원두봉투 사진';
  return area;
}

const storeLabel = (s: string | null) => (s === 'yangjae' ? '양재천' : s === 'pangyo' ? '판교' : '');
const fmtSize = (n: number | null) => {
  if (!n) return '—';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
};
const fmtAt = (s: string) => s.replace('T', ' ').slice(0, 16);

export default function OriginalsHistory({ rows }: { rows: OriginalRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mx-auto my-[60px] max-w-[460px] text-center text-muted-foreground">
        <div className="mb-3 text-[32px]">🗄️</div>
        <h2 className="mb-2 text-[15px] text-foreground">아직 보관된 원본이 없어요</h2>
        <p className="text-[13px]">이 개선 이후 올린 자료부터 원본이 여기 쌓여요.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              <Th>구분</Th>
              <Th>파일명</Th>
              <Th>자료월</Th>
              <Th>브랜드·지점</Th>
              <Th>올린 사람</Th>
              <Th>업로드 시각</Th>
              <Th right>용량</Th>
              <Th right>원본</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-accent">
                <Td>
                  {areaLabel(r.area)}
                  {r.note && <span className="ml-1.5 text-[11px] text-muted-foreground">({r.note})</span>}
                </Td>
                <Td muted title={r.filename}>{r.filename}</Td>
                <Td mono muted>{r.ym ?? '—'}</Td>
                <Td muted>
                  {r.brand === 'staffmeal' ? '스탭밀' : r.brand === 'garden' ? `가든${r.store ? ` · ${storeLabel(r.store)}` : ''}` : '—'}
                </Td>
                <Td muted>{r.uploaded_by_email ?? '—'}</Td>
                <Td mono muted>{fmtAt(r.uploaded_at)}</Td>
                <Td right mono muted>{fmtSize(r.size)}</Td>
                <Td right>
                  <a
                    href={`/api/finance/originals/${r.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ta-btn h-7 px-3 text-[13px]"
                  >
                    보기
                  </a>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-normal ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({
  children,
  right,
  mono,
  muted,
  title,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
  muted?: boolean;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`max-w-[220px] truncate px-3 py-2 text-[13px] ${right ? 'text-right' : 'text-left'} ${mono ? 'tabular' : ''} ${
        muted ? 'text-muted-foreground' : 'text-foreground'
      }`}
    >
      {children}
    </td>
  );
}
