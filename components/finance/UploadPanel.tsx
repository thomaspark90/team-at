'use client';

import { useState } from 'react';
import type { BankSource, ParsedTransaction } from '@/lib/finance/types';

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

const won = (n: number) => n.toLocaleString('ko-KR');
const BANKS: { value: BankSource; label: string }[] = [
  { value: 'shinhan', label: '신한은행' },
  { value: 'woori', label: '우리은행' },
];
const ACCENT = '#0099FF';
const REV = '#12805c';
const EXP = '#b23b3b';

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
      if (!res.ok) throw new Error(json.error || '분석에 실패했습니다.');
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

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6, display: 'block' };
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, padding: 20 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.5px' }}>
          재무 · 거래내역 업로드
        </h1>
        <p style={{ fontSize: 14, color: '#888', margin: 0 }}>
          은행 거래내역 PDF를 올려 파싱·미리보기 후 저장해요. 같은 거래는 자동으로 중복 제거돼요.
        </p>
      </div>

      {/* 저장 완료 배너 */}
      {saved && (
        <div style={{ ...card, borderColor: REV, background: '#F0F9F5' }}>
          <div style={{ fontWeight: 700, color: REV, marginBottom: 4 }}>✓ 저장 완료</div>
          <div style={{ fontSize: 14, color: '#333' }}>
            {won(saved.saved)}건 저장 (자동 분류 {won(saved.autoClassified)}건) · 중복 {won(saved.duplicates)}건 건너뜀
          </div>
        </div>
      )}

      {/* 입력 카드 */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>은행</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {BANKS.map((b) => {
              const on = bank === b.value;
              return (
                <button
                  key={b.value}
                  onClick={() => setBank(b.value)}
                  style={{
                    padding: '8px 16px', borderRadius: 8,
                    border: `1px solid ${on ? ACCENT : '#DDD'}`,
                    background: on ? ACCENT : '#fff', color: on ? '#fff' : '#555',
                    fontWeight: on ? 600 : 500, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>거래내역 PDF</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSaved(null); }}
            style={{ fontSize: 14, fontFamily: 'inherit' }}
          />
        </div>

        <div>
          <label style={labelStyle}>
            PDF 비밀번호 {bank === 'shinhan' ? '(신한은 보통 필요)' : '(없으면 비워두세요)'}
          </label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="예: 940502"
            style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #DDD', borderRadius: 8, width: 200, fontFamily: 'inherit' }}
          />
        </div>

        <div>
          <button
            onClick={analyze} disabled={!file || loading}
            style={{
              padding: '10px 22px', borderRadius: 8, border: 'none',
              background: !file || loading ? '#CCC' : '#000', color: '#fff',
              fontWeight: 600, fontSize: 14, cursor: !file || loading ? 'default' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {loading ? '분석 중…' : '분석하기'}
          </button>
        </div>

        {error && <div style={{ color: EXP, fontSize: 13, fontWeight: 500 }}>⚠️ {error}</div>}
      </div>

      {/* 결과 */}
      {preview && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat label="총 거래" value={`${won(preview.totalRows)}건`} />
            <Stat label="신규(저장 대상)" value={`${won(preview.fresh)}건`} accent={ACCENT} />
            <Stat label="이미 저장됨(중복)" value={`${won(preview.duplicates)}건`} />
            <Stat label="입금 합계" value={won(preview.sumIn)} accent={REV} />
            <Stat label="출금 합계" value={won(preview.sumOut)} accent={EXP} />
          </div>

          {preview.fresh > 0 && (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: '#F7F9FB', color: '#888' }}>
                    <Th>거래일시</Th><Th>채널</Th><Th>내용</Th>
                    <Th right>출금</Th><Th right>입금</Th><Th>정규화 키(학습용)</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((t) => (
                    <tr key={t.dedupHash} style={{ borderTop: '1px solid #EEE' }}>
                      <Td mono>{t.txAt.replace('T', ' ')}</Td>
                      <Td>{t.channel}</Td>
                      <Td>{t.memo}</Td>
                      <Td right mono color={t.amountOut ? EXP : '#CCC'}>{t.amountOut ? won(t.amountOut) : '—'}</Td>
                      <Td right mono color={t.amountIn ? REV : '#CCC'}>{t.amountIn ? won(t.amountIn) : '—'}</Td>
                      <Td mono color="#888">{t.normalizedKey}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.fresh > preview.sample.length && (
              <div style={{ padding: '10px 16px', fontSize: 12, color: '#999' }}>
                … 외 {won(preview.fresh - preview.sample.length)}건 (미리보기는 최대 200건, 저장은 전체)
              </div>
            )}
          </div>
          )}

          {preview.fresh > 0 ? (
            <button
              onClick={save}
              disabled={saving}
              style={{
                alignSelf: 'flex-start', padding: '11px 26px', borderRadius: 8, border: 'none',
                background: saving ? '#CCC' : ACCENT, color: '#fff',
                fontWeight: 700, fontSize: 14, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {saving ? '저장 중…' : `${won(preview.fresh)}건 저장하기`}
            </button>
          ) : (
            <div style={{ ...card, background: '#F0F9F5', borderColor: REV }}>
              <div style={{ fontWeight: 700, color: REV, marginBottom: 4 }}>✓ 이미 모두 저장된 거래예요</div>
              <div style={{ fontSize: 14, color: '#333' }}>
                이 파일의 {won(preview.totalRows)}건은 전부 중복(이미 저장됨)이라 새로 저장할 게 없어요. 분류는{' '}
                <a href="/finance/classify" style={{ color: ACCENT, fontWeight: 700 }}>거래 분류 →</a> 에서 하세요.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 10, padding: '12px 16px', minWidth: 110, flex: '1 1 auto' }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ?? '#111', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ textAlign: right ? 'right' : 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</th>;
}
function Td({ children, right, mono, color }: { children: React.ReactNode; right?: boolean; mono?: boolean; color?: string }) {
  return (
    <td style={{
      textAlign: right ? 'right' : 'left', padding: '9px 14px', color: color ?? '#333',
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
      fontVariantNumeric: mono ? 'tabular-nums' : 'normal', whiteSpace: 'nowrap',
    }}>{children}</td>
  );
}
