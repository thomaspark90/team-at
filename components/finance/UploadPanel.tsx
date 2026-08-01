'use client';

import { useState } from 'react';
import type { BankSource, Brand, ParsedTransaction } from '@/lib/finance/types';
import { brandLabel } from '@/lib/finance/types';
import type { ContinuityReport, ExcelMapping } from '@/lib/finance/excel';
import { wonNum as won } from '@/lib/finance/format';

interface Preview {
  bank?: BankSource;
  totalRows: number;
  sumIn: number;
  sumOut: number;
  fresh: number;
  duplicates: number;
  sample: ParsedTransaction[];
  // 엑셀 경로에서만 — AI 열 매핑(저장 요청에 되돌려줌) + 잔액 연속성 검사 결과
  mapping?: ExcelMapping;
  continuity?: ContinuityReport | null;
  skipped?: number;
}
interface SaveResult {
  saved: number;
  duplicates: number;
  autoClassified: number;
}

// 파일별 진행 상태 — 여러 파일을 한 번에 올려 순차 파싱·저장한다
interface Entry {
  file: File;
  isExcel: boolean;
  status: 'picked' | 'parsing' | 'ready' | 'saving' | 'saved' | 'error';
  preview?: Preview;
  error?: string;
  result?: SaveResult;
}

const BANKS: { value: BankSource; label: string }[] = [
  { value: 'shinhan', label: '신한은행' },
  { value: 'woori', label: '우리은행' },
];

export default function UploadPanel({
  brand = 'garden',
  sharedGardenNote = false,
}: {
  brand?: Brand;
  sharedGardenNote?: boolean; // 가든 지점 페이지에서 — 통장이 공용임을 안내
}) {
  const [bank, setBank] = useState<BankSource>('shinhan');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SaveResult | null>(null); // 전 파일 합산 결과

  // 엑셀(.xlsx/.xls/.csv)은 AI 열 매핑 경로(/api/finance/excel/*)로, PDF는 은행 파서 경로로.
  const slotKey = bank === 'shinhan' ? 'bank_shinhan' : 'bank_woori'; // 월별 보드 완료 체크·잔액 연속성 검사용
  const hasPdf = entries.some((e) => !e.isExcel);

  const patch = (i: number, p: Partial<Entry>) =>
    setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...p } : e)));

  // 선택·드롭할 때마다 목록에 누적한다(교체 아님) — 파일을 하나씩 골라도 여러 개가 쌓인다.
  // 같은 파일(이름+크기+수정시각)은 한 번만.
  function addFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []).filter((f) => /\.(pdf|xlsx|xls|csv)$/i.test(f.name));
    if (!files.length) return;
    setEntries((es) => {
      const seen = new Set(es.map((e) => `${e.file.name}|${e.file.size}|${e.file.lastModified}`));
      const added = files
        .filter((f) => !seen.has(`${f.name}|${f.size}|${f.lastModified}`))
        .map((f) => ({ file: f, isExcel: /\.(xlsx|xls|csv)$/i.test(f.name), status: 'picked' as const }));
      return [...es, ...added];
    });
    setDone(null);
    setError(null);
  }

  async function analyze() {
    if (!entries.length) return;
    setLoading(true);
    setError(null);
    setDone(null);
    // 순차 처리 — 엑셀은 파일마다 AI 열 매핑 호출이 붙어서 병렬로 몰지 않는다
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      patch(i, { status: 'parsing', preview: undefined, error: undefined, result: undefined });
      try {
        const fd = new FormData();
        fd.append('file', e.file);
        if (e.isExcel) {
          fd.append('slot', slotKey);
        } else {
          fd.append('bank', bank);
          fd.append('brand', brand);
          if (password) fd.append('password', password);
        }
        const res = await fetch(e.isExcel ? '/api/finance/excel/parse' : '/api/finance/parse', {
          method: 'POST',
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '입력에 실패했습니다.');
        patch(i, { status: 'ready', preview: json as Preview });
      } catch (err) {
        patch(i, { status: 'error', error: (err as Error).message });
      }
    }
    setLoading(false);
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    const total: SaveResult = { saved: 0, duplicates: 0, autoClassified: 0 };
    // 순차 저장 — 파일 간 겹치는 거래는 앞 파일 저장 후 DB 지문 대조로 자동으로 걸러진다
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.status !== 'ready' || !e.preview) continue;
      if (e.preview.fresh === 0) {
        patch(i, { status: 'saved', result: { saved: 0, duplicates: e.preview.duplicates, autoClassified: 0 } });
        continue;
      }
      patch(i, { status: 'saving' });
      try {
        const fd = new FormData();
        fd.append('file', e.file);
        fd.append('brand', brand);
        if (e.isExcel) {
          fd.append('mapping', JSON.stringify(e.preview.mapping));
          fd.append('slot', slotKey);
        } else {
          fd.append('bank', bank);
          if (password) fd.append('password', password);
        }
        const res = await fetch(e.isExcel ? '/api/finance/excel/save' : '/api/finance/save', {
          method: 'POST',
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '저장에 실패했습니다.');
        total.saved += Number(json.saved ?? 0);
        total.duplicates += Number(json.duplicates ?? 0);
        total.autoClassified += Number(json.autoClassified ?? 0);
        patch(i, { status: 'saved', result: json as SaveResult });
      } catch (err) {
        patch(i, { status: 'error', error: (err as Error).message });
      }
    }
    setDone(total);
    setSaving(false);
  }

  const ready = entries.filter((e) => e.status === 'ready' && e.preview);
  const agg = ready.reduce(
    (a, e) => ({
      totalRows: a.totalRows + e.preview!.totalRows,
      fresh: a.fresh + e.preview!.fresh,
      duplicates: a.duplicates + e.preview!.duplicates,
      sumIn: a.sumIn + e.preview!.sumIn,
      sumOut: a.sumOut + e.preview!.sumOut,
    }),
    { totalRows: 0, fresh: 0, duplicates: 0, sumIn: 0, sumOut: 0 }
  );
  const single = entries.length === 1 ? entries[0] : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-[22px] tracking-[-0.5px] text-foreground">
          {brandLabel(brand)} · 거래내역 업로드
        </h1>
        <p className="text-[13px] text-muted-foreground">
          {brandLabel(brand)} 명의 통장의 거래내역 PDF 또는 엑셀(.xlsx/.xls/.csv)을 <b>여러 개 한 번에</b> 올려
          파싱·미리보기 후 저장해요. 엑셀은 AI가 양식과 무관하게 열을 읽어요. 같은 거래는 파일 안·파일 간·재업로드 모두
          자동으로 중복 제거되고, 거래는 각자 실제 날짜의 달로, 전부 <b>{brandLabel(brand)}</b> 회계로 들어가요.{' '}
          <span className="text-amber-600 dark:text-amber-500">
            단, 같은 기간을 PDF와 엑셀로 번갈아 올리면 중복을 걸러내지 못하니 계좌마다 한 가지 형식으로만 올려주세요.
            한 번에 올리는 파일들은 위에서 고른 같은 은행 것이어야 해요.
          </span>
          {sharedGardenNote && (
            <>
              {' '}
              <span className="text-amber-600 dark:text-amber-500">
                통장은 가든 공용이라 지점이 자동으로 찍히지 않아요 — 지출 자료 분류에서 지점 지정·분할로 나눠주세요.
              </span>
            </>
          )}
        </p>
      </div>

      {/* 저장 완료 배너 — 전 파일 합산 */}
      {done && (
        <div className="rounded-md border border-border bg-muted p-4">
          <div className="mb-1 text-foreground">✓ 저장 완료</div>
          <div className="text-[13px] text-muted-foreground">
            {won(done.saved)}건 저장 (자동 분류 {won(done.autoClassified)}건) · 중복 {won(done.duplicates)}건 건너뜀
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
          <label className="ta-label">거래내역 파일 (PDF·엑셀 — 여러 개 선택 가능)</label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3"
          >
            <input
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = ''; // 같은 파일을 다시 골라도 onChange가 뜨게
              }}
              className="text-[13px] text-foreground"
            />
            <p className="m-0 text-[11px] text-muted-foreground">
              파일을 이 칸에 끌어다 놓아도 돼요. 선택 창에서는 ⌘(맥)/Ctrl(윈도우)을 누른 채 클릭하면 여러 개가
              골라지고, <b>하나씩 다시 선택해도 아래 목록에 계속 추가</b>돼요.
            </p>
          </div>
        </div>

        {(!entries.length || hasPdf) && (
          <div>
            <label className="ta-label">
              PDF 비밀번호 {bank === 'shinhan' ? '(신한은 보통 필요)' : '(없으면 비워두세요)'} — 모든 PDF에 같이 적용
            </label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="예: 940502"
              className="ta-input w-[200px]"
            />
          </div>
        )}

        <div>
          <button
            onClick={analyze} disabled={!entries.length || loading || saving}
            className="ta-btn-primary"
          >
            {loading ? '읽는 중…' : entries.length > 1 ? `${entries.length}개 파일 읽기` : '업로드'}
          </button>
        </div>

        {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}
      </div>

      {/* 파일별 목록 — 선택 즉시 표시, 파싱·저장 진행 상태 겸용 */}
      {entries.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2 text-[12px] text-muted-foreground">
            <span>{entries.length}개 파일 선택됨</span>
            {!loading && !saving && (
              <button onClick={() => setEntries([])} className="hover:text-foreground">
                전체 비우기
              </button>
            )}
          </div>
          {entries.map((e, i) => (
            <div key={`${e.file.name}-${i}`} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[13px] ${i > 0 ? 'border-t border-border' : ''}`}>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {e.file.name}
                <span className="ml-2 text-[11px] uppercase text-muted-foreground">{e.isExcel ? '엑셀' : 'PDF'}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {e.preview?.continuity && (
                  e.preview.continuity.breaks === 0 ? (
                    <span className="text-[12px] text-emerald-600">잔액연속 ✓</span>
                  ) : e.preview.continuity.reliable ? (
                    <span className="text-[12px] text-red-500">⚠ 잔액 끊김 {e.preview.continuity.breaks}곳</span>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">잔액연속 판정불가</span>
                  )
                )}
                {e.status === 'picked' && <span className="text-muted-foreground">대기</span>}
                {e.status === 'parsing' && <span className="text-muted-foreground">읽는 중…</span>}
                {e.status === 'ready' && e.preview && (
                  e.preview.fresh > 0 ? (
                    <span>
                      <b className="text-emerald-600">신규 {won(e.preview.fresh)}건</b>
                      {e.preview.duplicates > 0 && <span className="text-muted-foreground"> · 중복 {won(e.preview.duplicates)}</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">모두 이미 저장됨 ({won(e.preview.totalRows)}건)</span>
                  )
                )}
                {e.status === 'saving' && <span className="text-muted-foreground">저장 중…</span>}
                {e.status === 'saved' && e.result && (
                  <span className="text-emerald-600">✓ {won(e.result.saved)}건 저장</span>
                )}
                {e.status === 'error' && <span className="text-red-500">⚠ {e.error}</span>}
                {!loading && !saving && e.status !== 'saved' && e.status !== 'saving' && (
                  <button
                    onClick={() => setEntries((es) => es.filter((_, j) => j !== i))}
                    aria-label="목록에서 제거"
                    className="rounded px-1 text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 합산 미리보기 + 저장 */}
      {ready.length > 0 && !done && (
        <>
          <div className="flex flex-wrap gap-3">
            <Stat label="총 거래" value={`${won(agg.totalRows)}건`} />
            <Stat label="신규(저장 대상)" value={`${won(agg.fresh)}건`} />
            <Stat label="이미 저장됨(중복)" value={`${won(agg.duplicates)}건`} />
            <Stat label="입금 합계" value={won(agg.sumIn)} />
            <Stat label="출금 합계" value={won(agg.sumOut)} />
          </div>

          {entries.length > 1 && agg.fresh > 0 && (
            <p className="m-0 text-[12px] text-muted-foreground">
              파일 간 기간이 겹치면 신규 합계가 실제보다 크게 보일 수 있어요 — 저장할 때 앞 파일부터 차례로 넣으며
              겹치는 거래는 자동으로 걸러져요.
            </p>
          )}

          {single?.preview && single.preview.fresh > 0 && (
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
                  {single.preview.sample.map((t) => (
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
            {single.preview.fresh > single.preview.sample.length && (
              <div className="border-t border-border px-4 py-[10px] text-[11px] text-muted-foreground">
                … 외 {won(single.preview.fresh - single.preview.sample.length)}건 (미리보기는 최대 200건, 저장은 전체)
              </div>
            )}
          </div>
          )}

          {agg.fresh > 0 ? (
            <button
              onClick={saveAll}
              disabled={saving}
              className="ta-btn-primary self-start"
            >
              {saving ? '저장 중…' : `${entries.length > 1 ? `${ready.length}개 파일 · ` : ''}${won(agg.fresh)}건 저장하기`}
            </button>
          ) : (
            <div className="rounded-md border border-border bg-muted p-4">
              <div className="mb-1 text-foreground">✓ 이미 모두 저장된 거래예요</div>
              <div className="text-[13px] text-muted-foreground">
                올린 파일의 {won(agg.totalRows)}건은 전부 중복(이미 저장됨)이라 새로 저장할 게 없어요. 분류는{' '}
                <a href="/finance/classify" className="text-foreground underline">지출 자료 분류 →</a> 에서 하세요.
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
