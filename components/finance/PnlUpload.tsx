'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CatAgg {
  category: string;
  qty: number;
  supply: number;
}
interface Preview {
  ym: string;
  yms: string[];
  totals: { qty: number; gross: number; vat: number; supply: number };
  byCategory: CatAgg[];
  excluded: { rows: number; gross: number; vat: number };
  meta: { dataRows: number; completed: number; canceled: number };
}
interface ApplyResult {
  ym: string;
  yms: string[];
  inserted: number;
  supply: number;
  excludedRows: number;
}

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const fmtYm = (ym: string) => `${ym.split('-')[0]}년 ${Number(ym.split('-')[1])}월`;

export default function PnlUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('0000');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<ApplyResult | null>(null);

  const reset = () => { setPreview(null); setDone(null); setError(null); };

  async function analyze() {
    if (!file) return;
    setLoading(true); reset();
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('password', password);
      const res = await fetch('/api/finance/pos/parse', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '읽기에 실패했어요.');
      setPreview(j as Preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!file || !preview) return;
    setApplying(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('password', password);
      const res = await fetch('/api/finance/pos/apply', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장에 실패했어요.');
      const result = j as ApplyResult;
      setDone(result);
      setPreview(null);
      router.push(`/finance/pnl?ym=${result.ym}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="ta-btn">
        ＋ POS 매출 올리기
      </button>
    );
  }

  return (
    <div className="ta-card flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-foreground">POS 매출 올리기</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            토스 매출리포트 엑셀(<b>상품 주문 상세내역</b>)을 올리면 <b>공급가액 매출</b>이 월별로 반영돼요. 같은 달을 다시 올리면 교체돼요. (상품권은 매출에서 제외)
          </p>
        </div>
        <button onClick={() => { setOpen(false); reset(); }} className="text-[13px] text-muted-foreground hover:text-foreground">닫기</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }}
          className="text-[14px] text-foreground"
        />
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          비번
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ta-input h-8 w-24"
            placeholder="0000"
          />
        </label>
        <button onClick={analyze} disabled={!file || loading} className="ta-btn-primary">
          {loading ? '읽는 중…' : '미리보기'}
        </button>
      </div>

      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}

      {done && (
        <div className="rounded-md border border-border bg-muted p-4 text-[14px]">
          <div className="mb-1 text-foreground">✓ 저장 완료 — {done.yms.map(fmtYm).join(', ')}</div>
          <div className="text-muted-foreground">
            공급가액 매출 <b className="text-foreground">{won(done.supply)}</b> · {done.inserted}개 집계행{done.excludedRows ? ` · 상품권 ${done.excludedRows}건 제외` : ''}
          </div>
        </div>
      )}

      {preview && (
        <>
          <div className="flex flex-wrap gap-3 text-[13px]">
            <span className="rounded-md border border-border px-3 py-1.5">대상 월 <b>{preview.yms.map(fmtYm).join(', ')}</b></span>
            <span className="rounded-md border border-border px-3 py-1.5">공급가액 매출 <b className="text-positive">{won(preview.totals.supply)}</b></span>
            <span className="rounded-md border border-border px-3 py-1.5">주문행 <b>{preview.meta.dataRows.toLocaleString('ko-KR')}</b> (취소 {preview.meta.canceled})</span>
            {preview.excluded.rows > 0 && (
              <span className="rounded-md border border-border px-3 py-1.5 text-muted-foreground">상품권 제외 {preview.excluded.rows}건 ({won(preview.excluded.gross)})</span>
            )}
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-background">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                  <th className="px-3 py-2 text-left font-normal">카테고리</th>
                  <th className="px-3 py-2 text-right font-normal">수량</th>
                  <th className="px-3 py-2 text-right font-normal">공급가액</th>
                </tr>
              </thead>
              <tbody>
                {preview.byCategory.map((c) => (
                  <tr key={c.category} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{c.category}</td>
                    <td className="px-3 py-2 text-right tabular text-muted-foreground">{c.qty.toLocaleString('ko-KR')}</td>
                    <td className="px-3 py-2 text-right tabular text-foreground">{won(c.supply)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={apply} disabled={applying} className="ta-btn-primary self-start">
            {applying ? '저장 중…' : `${preview.yms.map(fmtYm).join(', ')} 매출 저장`}
          </button>
        </>
      )}
    </div>
  );
}
