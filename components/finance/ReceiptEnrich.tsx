'use client';

import { useState } from 'react';

interface Item {
  product: string;
  seller: string;
  amount: number;
}
interface Group {
  approvalNo: string;
  ymd: string;
  sum: number;
  itemCount: number;
  items: Item[];
  matched: { id: number; memo: string; amount: number; txAt: string } | null;
}
interface Preview {
  totalItems: number;
  groups: number;
  matched: number;
  preview: Group[];
}
interface ApplyResult {
  matchedGroups: number;
  inserted: number;
  duplicates?: number;
  note?: string;
}

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

export default function ReceiptEnrich() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<ApplyResult | null>(null);

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setDone(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/finance/receipt/parse', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '입력에 실패했어요.');
      setPreview(j as Preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!file || !preview) return;
    setApplying(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/finance/receipt/apply', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '적용에 실패했어요.');
      setDone(j as ApplyResult);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="ta-card flex flex-col gap-4">
      <div>
        <h2 className="text-[16px] font-bold text-foreground">🧾 쿠팡 영수증으로 품목 보강</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          쿠팡 <b>신용카드 매출전표(PDF)</b>를 올리면, 카드의 <b>쿠팡 결제</b>가 승인번호로 매칭돼 <b>품목별로 분해</b>돼요. (마이쿠팡 &gt; 마이쇼핑 &gt; 영수증 조회/출력 &gt; 신용카드 매출전표)
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setDone(null); setPreview(null); }}
          className="text-[14px] text-foreground"
        />
        <button onClick={analyze} disabled={!file || loading} className="ta-btn-primary text-[13px]">
          {loading ? '입력 중…' : '입력하기'}
        </button>
      </div>

      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}

      {done && (
        <div className="rounded-md border border-border bg-muted p-4 text-[14px]">
          <div className="mb-1 text-foreground">✓ 품목 보강 완료</div>
          <div className="text-muted-foreground">
            카드 {done.matchedGroups}건 분해 · 품목 {done.inserted}건 추가{done.duplicates ? ` · 중복 ${done.duplicates}건 건너뜀` : ''}
            {done.note && ` · ${done.note}`} ·{' '}
            <a href="/finance/classify?source=card" className="text-foreground underline">거래 분류에서 지정 →</a>
          </div>
        </div>
      )}

      {preview && (
        <>
          <div className="flex flex-wrap gap-3 text-[13px]">
            <span className="rounded-md border border-border px-3 py-1.5">전표 품목 <b>{preview.totalItems}</b></span>
            <span className="rounded-md border border-border px-3 py-1.5">결제(승인) <b>{preview.groups}</b>건</span>
            <span className="rounded-md border border-border px-3 py-1.5">
              카드 매칭 <b className={preview.matched ? 'text-positive' : 'text-destructive'}>{preview.matched}</b>건
            </span>
          </div>
          {preview.matched === 0 && (
            <div className="rounded-md border border-border bg-muted p-3 text-[13px] text-muted-foreground">
              매칭되는 카드 쿠팡 거래가 없어요. 같은 카드의 이용내역이 먼저 저장돼 있어야 하고, 승인번호(또는 날짜+금액)가 맞아야 해요.
            </div>
          )}

          <div className="overflow-hidden rounded-md border border-border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                    <Th>결제일</Th><Th>승인</Th><Th>품목(판매자)</Th><Th right>금액</Th><Th>카드 매칭</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((g) =>
                    g.items.map((it, idx) => (
                      <tr key={g.approvalNo + idx} className="border-t border-border hover:bg-accent">
                        <Td mono>{idx === 0 ? g.ymd : ''}</Td>
                        <Td mono muted>{idx === 0 ? g.approvalNo : ''}</Td>
                        <Td>{it.product}{it.seller ? <span className="text-muted-foreground"> · {it.seller}</span> : ''}</Td>
                        <Td right mono>-{won(it.amount).replace('₩', '')}</Td>
                        <Td>
                          {idx === 0 &&
                            (g.matched ? (
                              <span className="text-positive">✓ {won(g.matched.amount)}{g.matched.amount !== g.sum ? ' ⚠️금액상이' : ''}</span>
                            ) : (
                              <span className="text-muted-foreground">미매칭</span>
                            ))}
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {preview.matched > 0 && (
            <button onClick={apply} disabled={applying} className="ta-btn-primary self-start text-[13px]">
              {applying ? '적용 중…' : `${preview.matched}건 분해 적용`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-normal ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, mono, muted }: { children: React.ReactNode; right?: boolean; mono?: boolean; muted?: boolean }) {
  return (
    <td className={`px-3 py-2 text-[13px] ${right ? 'whitespace-nowrap text-right' : 'text-left'} ${mono ? 'tabular' : ''} ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{children}</td>
  );
}
