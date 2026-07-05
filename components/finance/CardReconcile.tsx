'use client';

import { useState } from 'react';
import type { ParsedTransaction } from '@/lib/finance/types';

interface Candidate {
  id: number;
  txAt: string;
  memo: string;
  amount: number;
  ym: string;
  diff: number;
}
interface Preview {
  totalRows: number;
  fresh: number;
  duplicates: number;
  sumOut: number;
  sumIn: number;
  net: number;
  usageYm: string | null;
  sample: ParsedTransaction[];
  candidates: Candidate[];
}
interface SaveResult {
  saved: number;
  duplicates: number;
  autoClassified: number;
  linked: boolean;
}

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const fmtYm = (ym: string | null) => (ym ? `${ym.split('-')[0]}년 ${Number(ym.split('-')[1])}월` : '');

export default function CardReconcile() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [sel, setSel] = useState<number | 'none'>('none');

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setSaved(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/finance/card/parse', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '입력에 실패했어요.');
      setPreview(j as Preview);
      // 최적 후보 자동 선택 — 단, 차액이 크면(사용합계의 15% 초과) 엉뚱한 매칭 방지 위해 '미연결' 기본
      const best = (j.candidates as Candidate[] | undefined)?.[0];
      const tol = Math.max(50000, (j.net as number) * 0.15);
      setSel(best && Math.abs(best.diff) <= tol ? best.id : 'none');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!file || !preview) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (sel !== 'none') fd.append('settledTxId', String(sel));
      const res = await fetch('/api/finance/card/save', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장에 실패했어요.');
      setSaved(j as SaveResult);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const cand = preview?.candidates.find((c) => c.id === sel) ?? null;
  const diff = cand ? cand.amount - preview!.net : 0;

  return (
    <div className="flex flex-col gap-5">
      {saved && (
        <div className="rounded-md border border-border bg-muted p-4">
          <div className="mb-1 text-foreground">✓ 저장 완료{saved.linked ? ' · 정산 연결됨' : ' · 미연결(결제 대기)'}</div>
          <div className="text-[14px] text-muted-foreground">
            {won(saved.saved).replace('₩', '')}건 저장 · 중복 {saved.duplicates}건 건너뜀 · 카테고리는 직접 지정해요(학습된 가맹점은 미리 선택돼요) ·{' '}
            <a href="/finance/classify?source=card" className="text-foreground underline">거래 분류에서 지정 →</a>
          </div>
        </div>
      )}

      {/* 업로드 카드 */}
      <div className="ta-card flex flex-col gap-4">
        <div>
          <h2 className="text-[16px] font-bold text-foreground">신한카드 이용내역으로 지출 자료 세분화</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            신한 사업자카드 <b>이용내역 엑셀</b>을 올려, 통장의 <b>‘신한카드’ 결제 건</b>과 연결하세요. 그 결제 한 줄이 아래 사용내역으로 나뉘어 거래 분류에 들어가요.
          </p>
        </div>
        <div>
          <label className="ta-label">신한카드 이용내역 (엑셀)</label>
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSaved(null); setPreview(null); }}
            className="text-[14px] text-foreground"
          />
        </div>
        <div>
          <button onClick={analyze} disabled={!file || loading} className="ta-btn-primary">
            {loading ? '입력 중…' : '입력하기'}
          </button>
        </div>
        {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}
      </div>

      {/* 정산(B안): 스트립 + 내역 미리보기 */}
      {preview && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          {/* 정산 스트립 */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border bg-muted p-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                카드 사용합계 · {fmtYm(preview.usageYm)} · 신규 {preview.fresh}건
              </div>
              <div className="tabular text-[20px] font-extrabold text-foreground">{won(preview.net)}</div>
              {preview.sumIn > 0 && (
                <div className="text-[11px] text-muted-foreground">사용 {won(preview.sumOut)} − 환불 {won(preview.sumIn)}</div>
              )}
            </div>
            <div className="text-[18px] text-muted-foreground">↔</div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">은행 카드결제 (연결 대상)</div>
              {preview.candidates.length > 0 ? (
                <select value={sel} onChange={(e) => setSel(e.target.value === 'none' ? 'none' : Number(e.target.value))} className="ta-input mt-1 text-[14px]">
                  {preview.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.txAt.slice(0, 10)} · {won(c.amount)} {Math.abs(c.diff) < 1 ? '(정확히 일치)' : `(차액 ${won(Math.abs(c.diff))})`}
                    </option>
                  ))}
                  <option value="none">연결 안 함 (미연결로 저장)</option>
                </select>
              ) : (
                <div className="text-[14px] text-muted-foreground">후보 없음 — 미연결로 저장돼요</div>
              )}
            </div>
            <div>
              {cand ? (
                Math.abs(diff) < 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-positive/15 px-3 py-1 text-[12px] font-bold text-positive">✅ 일치 · 차액 ₩0</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-[12px] font-bold text-amber-600">⚠️ 차액 {won(Math.abs(diff))}</span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[12px] font-bold text-muted-foreground">🕗 미연결(결제 대기)</span>
              )}
            </div>
            <span className="flex-1" />
            <button onClick={save} disabled={saving || preview.fresh === 0} className="ta-btn-primary">
              {saving ? '저장 중…' : cand ? '연결 확정 · 저장' : '미연결로 저장'}
            </button>
          </div>

          <div className="border-b border-border px-4 py-[10px] text-[12.5px] text-muted-foreground">
            연결하면 아래 <b>{preview.fresh}건</b>이 거래 분류에 편입되고, 통장의 카드결제 1건은 <b>손익 제외 › 카드대금정산</b>으로 잠겨요.
            {preview.duplicates > 0 && <> (이미 저장된 {preview.duplicates}건 제외)</>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                  <Th>일자</Th><Th>가맹점(내용)</Th><Th right>금액</Th><Th>정규화 키(학습용)</Th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((t) => (
                  <tr key={t.dedupHash} className="border-t border-border hover:bg-accent">
                    <Td mono>{t.txAt.slice(0, 10)}</Td>
                    <Td>
                      {t.memo}
                      {t.isInstallment && <span className="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">할부</span>}
                    </Td>
                    <Td right mono>
                      {t.amountIn > 0 ? <span className="text-positive">+{won(t.amountIn).replace('₩', '')} 환불</span> : `-${won(t.amountOut).replace('₩', '')}`}
                    </Td>
                    <Td mono muted>{t.normalizedKey}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.fresh > preview.sample.length && (
            <div className="border-t border-border px-4 py-[10px] text-[12px] text-muted-foreground">
              … 외 {preview.fresh - preview.sample.length}건 (미리보기 최대 300건, 저장은 전체)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-normal ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, mono, muted }: { children: React.ReactNode; right?: boolean; mono?: boolean; muted?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 text-[13px] ${right ? 'text-right' : 'text-left'} ${mono ? 'tabular' : ''} ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{children}</td>
  );
}
