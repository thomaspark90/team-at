'use client';

import { useState } from 'react';
import type { BankSource, ParsedTransaction } from '@/lib/finance/types';
import { wonNum as won } from '@/lib/finance/format';

interface Preview {
  bank: BankSource;
  totalRows: number;
  sumIn: number;
  sumOut: number;
  fresh: number;
  duplicates: number;
  sample: ParsedTransaction[];
}
interface SaveResult {
  saved: number;
  duplicates: number;
  autoClassified: number;
}

const BANKS: { value: BankSource; label: string }[] = [
  { value: 'shinhan', label: '신한은행' },
  { value: 'woori', label: '우리은행' },
];

export default function UploadPanel() {
  const [bank, setBank] = useState<BankSource>('shinhan');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saved, setSaved] = useState<SaveResult | null>(null);

  function buildForm() {
    const fd = new FormData();
    fd.append('file', file as File);
    fd.append('bank', bank);
    if (password) fd.append('password', password);
    return fd;
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setSaved(null);
    try {
      const res = await fetch('/api/finance/parse', { method: 'POST', body: buildForm() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '입력에 실패했습니다.');
      setPreview(json as Preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!file || !preview || preview.fresh === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/save', { method: 'POST', body: buildForm() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장에 실패했습니다.');
      setSaved(json as SaveResult);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-[22px] tracking-[-0.5px] text-foreground">
          재무 · 거래내역 업로드
        </h1>
        <p className="text-[13px] text-muted-foreground">
          은행 거래내역 PDF를 올려 파싱·미리보기 후 저장해요. 같은 거래는 자동으로 중복 제거돼요.
        </p>
      </div>

      {/* 저장 완료 배너 */}
      {saved && (
        <div className="rounded-md border border-border bg-muted p-4">
          <div className="mb-1 text-foreground">✓ 저장 완료</div>
          <div className="text-[13px] text-muted-foreground">
            {won(saved.saved)}건 저장 (자동 분류 {won(saved.autoClassified)}건) · 중복 {won(saved.duplicates)}건 건너뜀
          </div>
        </div>
      )}

      {/* 입력 카드 */}
      <div className="ta-card flex flex-col gap-4">
        <div>
          <label className="ta-label">은행</label>
          <div className="inline-flex gap-1 rounded-md border border-border p-1">
            {BANKS.map((b) => {
              const on = bank === b.value;
              return (
                <button
                  key={b.value}
                  onClick={() => setBank(b.value)}
                  className={`rounded-sm px-4 py-1.5 text-[13px] ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="ta-label">거래내역 PDF</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSaved(null); }}
            className="text-[13px] text-foreground"
          />
        </div>

        <div>
          <label className="ta-label">
            PDF 비밀번호 {bank === 'shinhan' ? '(신한은 보통 필요)' : '(없으면 비워두세요)'}
          </label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="예: 940502"
            className="ta-input w-[200px]"
          />
        </div>

        <div>
          <button
            onClick={analyze} disabled={!file || loading}
            className="ta-btn-primary"
          >
            {loading ? '업로드 중…' : '업로드'}
          </button>
        </div>

        {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}
      </div>

      {/* 결과 */}
      {preview && (
        <>
          <div className="flex flex-wrap gap-3">
            <Stat label="총 거래" value={`${won(preview.totalRows)}건`} />
            <Stat label="신규(저장 대상)" value={`${won(preview.fresh)}건`} />
            <Stat label="이미 저장됨(중복)" value={`${won(preview.duplicates)}건`} />
            <Stat label="입금 합계" value={won(preview.sumIn)} />
            <Stat label="출금 합계" value={won(preview.sumOut)} />
          </div>

          {preview.fresh > 0 && (
          <div className="overflow-hidden rounded-md border border-border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                    <Th>거래일시</Th><Th>채널</Th><Th>내용</Th>
                    <Th right>출금</Th><Th right>입금</Th><Th>정규화 키(학습용)</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((t) => (
                    <tr key={t.dedupHash} className="border-t border-border hover:bg-accent">
                      <Td mono>{t.txAt.replace('T', ' ')}</Td>
                      <Td>{t.channel}</Td>
                      <Td>{t.memo}</Td>
                      <Td right mono muted={!t.amountOut}>{t.amountOut ? won(t.amountOut) : '—'}</Td>
                      <Td right mono pos muted={!t.amountIn}>{t.amountIn ? won(t.amountIn) : '—'}</Td>
                      <Td mono muted>{t.normalizedKey}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.fresh > preview.sample.length && (
              <div className="border-t border-border px-4 py-[10px] text-[11px] text-muted-foreground">
                … 외 {won(preview.fresh - preview.sample.length)}건 (미리보기는 최대 200건, 저장은 전체)
              </div>
            )}
          </div>
          )}

          {preview.fresh > 0 ? (
            <button
              onClick={save}
              disabled={saving}
              className="ta-btn-primary self-start"
            >
              {saving ? '저장 중…' : `${won(preview.fresh)}건 저장하기`}
            </button>
          ) : (
            <div className="rounded-md border border-border bg-muted p-4">
              <div className="mb-1 text-foreground">✓ 이미 모두 저장된 거래예요</div>
              <div className="text-[13px] text-muted-foreground">
                이 파일의 {won(preview.totalRows)}건은 전부 중복(이미 저장됨)이라 새로 저장할 게 없어요. 분류는{' '}
                <a href="/finance/classify" className="text-foreground underline">거래 분류 →</a> 에서 하세요.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[110px] flex-[1_1_auto] rounded-md border border-border bg-card px-4 py-3">
      <div className="mb-1 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="tabular text-[15px] text-foreground">{value}</div>
    </div>
  );
}
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-normal ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, mono, muted, pos }: { children: React.ReactNode; right?: boolean; mono?: boolean; muted?: boolean; pos?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 text-[13px] ${right ? 'text-right' : 'text-left'} ${mono ? 'tabular' : ''} ${muted ? 'text-muted-foreground' : pos ? 'text-positive' : 'text-foreground'}`}>{children}</td>
  );
}
