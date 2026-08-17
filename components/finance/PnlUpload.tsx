'use client';

import { useRef, useState } from 'react';

import { useRefresh } from '@/components/Refresh';
import { won, fmtYm } from '@/lib/finance/format';
import type { Brand, Store } from '@/lib/finance/types';

interface CatAgg {
  category: string;
  qty: number;
  supply: number;
}
// 같은 달 재업로드가 이미 저장된 자료와 완전히 같은지 — 미리보기·저장 결과 둘 다에 실려 온다
interface YmDup {
  ym: string;
  duplicate: boolean;
  lastUploadedAt: string | null;
}
interface DaySummary {
  date: string;
  qty: number;
  supply: number;
}
interface ProductSummary {
  category: string;
  product: string;
  qty: number;
  supply: number;
}
// 다른 지점·브랜드 파일을 잘못 골라 올리는 사고 방지(2026-08-09) — 기존 자료와 많이 다르면 뜬다
interface Plausibility {
  suspicious: boolean;
  reasons: string[];
  existingAvgDaily: number;
  newAvgDaily: number;
  existingCategories: string[];
  newCategories: string[];
}
interface Preview {
  ym: string;
  yms: string[];
  totals: { qty: number; gross: number; vat: number; supply: number };
  byCategory: CatAgg[];
  excluded: { rows: number; gross: number; vat: number };
  meta: { dataRows: number; completed: number; canceled: number };
  duplicates?: YmDup[];
  byDay?: DaySummary[];
  byProduct?: ProductSummary[];
  plausibility?: Plausibility | null;
}
interface ApplyResult {
  ym: string;
  yms: string[];
  inserted: number;
  supply: number;
  excludedRows: number;
  duplicateYms: string[];
  changedYms: string[];
}

// KST 로 "8/9 11:31" 형태로 — 중복 안내에 "언제 올린 자료와 같은지" 보여줄 때 씀
const fmtDt = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

// POS 단위 — 파일 하나 = 한 (브랜드, 지점). 지점마다 POS가 다르다:
// 양재천=토스(암호화 0000), 스탭밀=페이히어.
// 가든·판교(페이히어)는 가든 회계와 무관해 업로드 대상에서 제외(2026-08-17 대표 지시 — 기존 데이터는 보존).
interface PosUnit {
  key: string;
  brand: Brand;
  store: Store | '';
  posType: 'toss' | 'payhere';
  label: string;
}
const POS_UNITS: PosUnit[] = [
  { key: 'garden-yangjae', brand: 'garden', store: 'yangjae', posType: 'toss', label: '가든 · 양재천 (토스)' },
  { key: 'staffmeal', brand: 'staffmeal', store: '', posType: 'payhere', label: '스탭밀 (페이히어)' },
];

// 일괄(복수 파일) 업로드 결과 한 줄
interface BatchRow {
  name: string;
  yms: string[];
  supply: number;
  inserted: number;
  excludedRows: number;
  duplicateYms: string[];
  error?: string;
}

export default function PnlUpload({ fixedUnitKey }: { fixedUnitKey?: string }) {
  const { refresh } = useRefresh();
  const fixedUnit = POS_UNITS.find((u) => u.key === fixedUnitKey) ?? null;
  const [file, setFile] = useState<File | null>(null);
  // 복수 파일 선택 시 — 월별 파일 여러 개를 한 번에 순차 업로드(2026-08-01 대표 요청)
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchAt, setBatchAt] = useState<number | null>(null); // 진행 중인 파일 index
  const [batchResults, setBatchResults] = useState<BatchRow[]>([]);
  const [password, setPassword] = useState((fixedUnit ?? POS_UNITS[0]).posType === 'toss' ? '0000' : '');
  const [unit, setUnit] = useState<PosUnit>(fixedUnit ?? POS_UNITS[0]);
  const [mapping, setMapping] = useState<{ sheet: string; header: Record<string, string> } | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<ApplyResult | null>(null);
  // 다른 지점·브랜드 파일 오업로드 방지(2026-08-09) — 경고가 뜨면 이 체크를 눌러야 저장 버튼이 풀린다
  const [confirmMismatch, setConfirmMismatch] = useState(false);
  const [checking, setChecking] = useState(false); // 일괄 업로드 사전 점검 중
  // 일괄 업로드 완료 배너 표시용 — 파일 입력 자체를 리셋해 "선택된 파일 N개"가 낡은 채로 남지 않게 한다
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null); setDone(null); setError(null); setMapping(null); setBatchResults([]); setConfirmMismatch(false);
  };

  async function analyze() {
    if (!file) return;
    setLoading(true); reset();
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('password', password);
      fd.append('posType', unit.posType);
      // 중복 감지용 — 이 브랜드·지점 자료 중 이미 저장된 달과 겹치는지 서버가 미리 비교해준다
      fd.append('brand', unit.brand);
      fd.append('store', unit.store);
      const res = await fetch('/api/finance/pos/parse', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '읽기에 실패했어요.');
      setPreview(j as Preview);
      setMapping((j.mapping as { sheet: string; header: Record<string, string> } | null) ?? null);
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
      fd.append('brand', unit.brand);
      fd.append('store', unit.store);
      fd.append('posType', unit.posType);
      fd.append('confirmMismatch', String(confirmMismatch));
      const res = await fetch('/api/finance/pos/apply', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장에 실패했어요.');
      const result = j as ApplyResult;
      setDone(result);
      setPreview(null);
      // 페이지 이동 없음 — 연속 업로드를 위해 그대로 유지(2026-08-01), 데이터만 갱신
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  // 복수 파일 순차 업로드 — 파일별 미리보기 없이 바로 저장(같은 달 재업로드=교체라 안전),
  // 끝나면 파일별 결과 표로 검증. 실패한 파일은 표에 남고 나머지는 계속 진행.
  async function applyBatch() {
    if (batchFiles.length === 0) return;
    setError(null);

    // 사전 점검 — 실제 저장 전에 이 지점·브랜드 기존 자료와 많이 다른 파일이 있는지 훑는다
    // (2026-08-09, 다른 지점 파일이 실수로 올라가 매출을 덮어쓴 사고 반영). 미리보기가 없는
    // 일괄 업로드는 여기서 막지 않으면 확인할 기회가 아예 없다.
    setChecking(true);
    const suspects: string[] = [];
    try {
      for (const f of batchFiles) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('password', password);
        fd.append('posType', unit.posType);
        fd.append('brand', unit.brand);
        fd.append('store', unit.store);
        const res = await fetch('/api/finance/pos/parse', { method: 'POST', body: fd });
        const j = await res.json();
        if (res.ok && j.plausibility?.suspicious) {
          suspects.push(`${f.name} — ${(j.plausibility.reasons as string[]).join(' · ')}`);
        }
      }
    } catch {
      // 사전 점검 자체가 실패해도 비치명적 — 실제 저장 단계에서 서버가 한 번 더 검사한다
    }
    setChecking(false);

    if (suspects.length > 0) {
      const proceed = window.confirm(
        `⚠ ${unit.label} 기존 자료와 많이 달라 보이는 파일이 ${suspects.length}개 있어요:\n\n${suspects.join('\n\n')}\n\n다른 지점·브랜드 파일을 잘못 고른 게 아닌지 확인하세요. 맞으면 확인을 눌러 계속 진행합니다.`,
      );
      if (!proceed) return;
    }
    const confirmMismatchAll = suspects.length > 0;

    setApplying(true);
    setBatchResults([]);
    const results: BatchRow[] = [];
    for (let i = 0; i < batchFiles.length; i++) {
      setBatchAt(i);
      const f = batchFiles[i];
      try {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('password', password);
        fd.append('brand', unit.brand);
        fd.append('store', unit.store);
        fd.append('posType', unit.posType);
        fd.append('confirmMismatch', String(confirmMismatchAll));
        const res = await fetch('/api/finance/pos/apply', { method: 'POST', body: fd });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || '저장 실패');
        const r = j as ApplyResult;
        results.push({
          name: f.name,
          yms: r.yms,
          supply: r.supply,
          inserted: r.inserted,
          excludedRows: r.excludedRows,
          duplicateYms: r.duplicateYms ?? [],
        });
      } catch (e) {
        results.push({ name: f.name, yms: [], supply: 0, inserted: 0, excludedRows: 0, duplicateYms: [], error: (e as Error).message });
      }
      setBatchResults([...results]);
    }
    setBatchAt(null);
    setBatchFiles([]);
    setApplying(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    refresh();
  }

  // 일괄 업로드 완료 배너 — 끝난 뒤에도 "뭐가 어떻게 됐는지" 화면에 또렷이 남긴다(2026-08-09,
  // 처리 자체가 빨라서 결과 없이 조용히 끝난 것처럼 보인다는 피드백)
  const batchDone = !applying && batchFiles.length === 0 && batchResults.length > 0;
  const batchOk = batchResults.filter((r) => !r.error);
  const batchFail = batchResults.filter((r) => r.error);
  const batchSupply = batchOk.reduce((s, r) => s + r.supply, 0);
  const batchYms = Array.from(new Set(batchOk.flatMap((r) => r.yms))).sort();
  const batchDupYms = Array.from(new Set(batchOk.flatMap((r) => r.duplicateYms))).sort();
  // 미리보기 단계 중복 안내 — 저장 누르기 전에 어느 달이 이미 있는 자료와 같은지 미리 알려준다
  const previewDupYms = (preview?.duplicates ?? []).filter((d) => d.duplicate);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="ta-btn">
        ＋ POS 매출 올리기
      </button>
    );
  }

  return (
    <div className="ta-card flex flex-col gap-8">
      <div className="flex items-start justify-between">
        {/* fixedUnit(단위별 자료 입력 페이지)일 땐 페이지 자체 제목·설명이 이미 있어 중복 표시 안 함 */}
        {fixedUnit ? (
          <div />
        ) : (
          <div>
            <h2 className="text-[15px] text-foreground">POS 매출 올리기</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              지점의 POS 매출리포트 엑셀을 올리면 <b>공급가액 매출</b>이 월별로 반영돼요. 같은 달·같은 지점을 다시 올리면 교체돼요.
              양재천=토스(비번 0000), 스탭밀=페이히어. (식권·상품권 판매는 선수금이라 매출에서 제외 — 사용 시점에 매출로 잡혀요)
            </p>
          </div>
        )}
        <button onClick={() => { setOpen(false); reset(); }} className="text-[13px] text-muted-foreground hover:text-foreground">닫기</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* POS 단위 선택 — 어느 브랜드·지점의 파일인지 (같은 달이라도 지점별로 따로 저장·교체).
            단위별 자료 입력 페이지에서는 단위가 고정돼 선택기가 숨는다. */}
        {fixedUnit ? (
          <span className="rounded-md bg-muted px-3 py-1.5 text-[13px] text-foreground">{fixedUnit.label}</span>
        ) : (
          <div className="flex overflow-hidden rounded-md border border-border">
            {POS_UNITS.map((u) => (
              <button
                key={u.key}
                onClick={() => { setUnit(u); setPassword(u.posType === 'toss' ? '0000' : ''); reset(); }}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  unit.key === u.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            // 1개 = 미리보기 확인 흐름, 2개 이상 = 순차 일괄 업로드 흐름
            setFile(list.length === 1 ? list[0] : null);
            setBatchFiles(list.length > 1 ? list : []);
            reset();
          }}
          className="text-[13px] text-foreground"
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
        {batchFiles.length > 1 ? (
          <button onClick={applyBatch} disabled={applying || checking} className="ta-btn-primary">
            {checking
              ? '기존 자료와 비교하는 중…'
              : applying && batchAt != null
              ? `${batchAt + 1}/${batchFiles.length} 업로드 중…`
              : `${batchFiles.length}개 파일 연속 업로드`}
          </button>
        ) : (
          <button onClick={analyze} disabled={!file || loading} className="ta-btn-primary">
            {loading ? '읽는 중…' : '업로드'}
          </button>
        )}
      </div>

      {batchFiles.length > 1 && !applying && batchResults.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          {batchFiles.length}개 파일을 순서대로 바로 저장해요(파일별 미리보기 없음 — 같은 달 재업로드는 교체라 안전).
          끝나면 파일별 결과 표로 확인해요.
        </p>
      )}

      {/* 사전 점검 중 안내(2026-08-09) — 실제 저장 전, 기존 자료와 많이 다른 파일이 있는지 훑는 단계 */}
      {checking && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-4 py-3 text-[13px]">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" aria-hidden />
          <span className="text-foreground">⏳ 저장 전 기존 자료와 비교하는 중…</span>
          <span className="text-muted-foreground">다른 지점 파일이 섞여 있는지 먼저 확인해요.</span>
        </div>
      )}

      {/* 처리 중 안내 — 뭘 하고 있는지 화면에 명시(2026-08-01 대표 요청) */}
      {applying && batchAt != null && batchFiles[batchAt] && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-4 py-3 text-[13px]">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" aria-hidden />
          <span className="text-foreground">
            ⏳ 파일 처리 중 — {batchAt + 1}/{batchFiles.length} · <b>{batchFiles[batchAt].name}</b>
          </span>
          <span className="text-muted-foreground">읽고 저장하는 데 파일당 몇 초 걸려요. 창을 닫지 마세요.</span>
        </div>
      )}
      {loading && file && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-4 py-3 text-[13px]">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" aria-hidden />
          <span className="text-foreground">⏳ 파일 읽는 중 — <b>{file.name}</b></span>
        </div>
      )}
      {applying && batchAt == null && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-4 py-3 text-[13px]">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" aria-hidden />
          <span className="text-foreground">⏳ 저장 중…</span>
        </div>
      )}

      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}

      {done && (
        <div className="rounded-md bg-muted p-4 text-[13px]">
          <div className="mb-1 text-foreground">
            {done.changedYms.length > 0
              ? `✓ 저장 완료 — ${done.changedYms.map(fmtYm).join(', ')} · 이어서 다음 파일을 올릴 수 있어요`
              : '↷ 전부 이미 있는 자료와 동일해 아무것도 바뀌지 않았어요'}
          </div>
          <div className="text-muted-foreground">
            공급가액 매출 <b className="text-foreground">{won(done.supply)}</b> · {done.inserted}개 집계행{done.excludedRows ? ` · 식권·상품권 ${done.excludedRows}건 제외` : ''} ·{' '}
            <a href={`/finance/pnl?ym=${done.ym}`} className="text-foreground underline">관리손익 보기 →</a>
          </div>
          {done.duplicateYms.length > 0 && (
            <div className="mt-1 text-muted-foreground">
              ↷ {done.duplicateYms.map(fmtYm).join(', ')}은 이미 있는 자료와 동일해 건너뛰었어요(원본 재보관 안 함)
            </div>
          )}
        </div>
      )}

      {batchDone && (
        <div
          className="rounded-md p-4 text-[13px]"
          style={{ background: batchFail.length > 0 ? 'hsl(25 85% 45% / 0.1)' : 'hsl(150 60% 35% / 0.1)' }}
        >
          <div className="mb-1 font-medium text-foreground">
            {batchFail.length === 0
              ? `✓ ${batchOk.length}개 파일 전부 저장 완료`
              : `⚠️ ${batchOk.length}개 저장 완료 · ${batchFail.length}개 실패 — 아래 표에서 실패 사유를 확인하세요`}
          </div>
          {batchOk.length > 0 && (
            <div className="text-muted-foreground">
              공급가액 합계 <b className="text-foreground">{won(batchSupply)}</b> · 대상 월{' '}
              <b className="text-foreground">{batchYms.map(fmtYm).join(', ')}</b> · 이어서 다음 파일을 올릴 수 있어요
            </div>
          )}
          {batchDupYms.length > 0 && (
            <div className="text-muted-foreground">
              ↷ {batchDupYms.map(fmtYm).join(', ')}은 이미 있는 자료와 동일해 건너뛰었어요(원본 재보관 안 함)
            </div>
          )}
        </div>
      )}

      {(batchResults.length > 0 || (applying && batchAt != null)) && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <th className="px-3 py-2 text-left font-normal">파일</th>
                <th className="px-3 py-2 text-left font-normal">월</th>
                <th className="px-3 py-2 text-right font-normal">공급가액</th>
                <th className="px-3 py-2 text-left font-normal">결과</th>
              </tr>
            </thead>
            <tbody>
              {batchResults.map((r) => (
                <tr key={r.name} className="border-t border-border">
                  <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground" title={r.name}>{r.name}</td>
                  <td className="px-3 py-2 text-foreground">{r.yms.map(fmtYm).join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-right tabular text-foreground">{r.error ? '—' : won(r.supply)}</td>
                  <td className="px-3 py-2">
                    {r.error ? (
                      <span className="text-destructive">❌ {r.error}</span>
                    ) : (
                      <span className="text-positive">
                        ✓ {r.inserted}행{r.excludedRows ? ` · 식권·상품권 ${r.excludedRows}건 제외` : ''}
                        {r.duplicateYms.length > 0 && (
                          <span className="text-muted-foreground"> · {r.duplicateYms.map(fmtYm).join(', ')} 동일 자료 건너뜀</span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {applying && batchAt != null && batchFiles[batchAt] && (
                <tr className="border-t border-border">
                  <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground">{batchFiles[batchAt].name}</td>
                  <td className="px-3 py-2 text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-muted-foreground">⏳ 처리 중…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <>
          <div className="flex flex-wrap gap-3 text-[13px]">
            <span className="rounded-md border border-border px-3 py-1.5">대상 월 <b>{preview.yms.map(fmtYm).join(', ')}</b></span>
            <span className="rounded-md border border-border px-3 py-1.5">공급가액 매출 <b className="text-positive">{won(preview.totals.supply)}</b></span>
            <span className="rounded-md border border-border px-3 py-1.5">주문행 <b>{preview.meta.dataRows.toLocaleString('ko-KR')}</b> (취소 {preview.meta.canceled})</span>
            {preview.excluded.rows > 0 && (
              <span className="rounded-md border border-border px-3 py-1.5 text-muted-foreground">식권·상품권 제외 {preview.excluded.rows}건 ({won(preview.excluded.gross)})</span>
            )}
          </div>

          {/* 미리보기만 보고 저장을 안 누른 채 떠나는 사고 방지(2026-08-08 판교 업로드 누락 건) */}
          <p className="m-0 text-[13px] font-medium" style={{ color: 'hsl(25 85% 45%)' }}>
            ⚠️ 아직 저장 전이에요 — 내용 확인 후 아래 &lsquo;매출 저장&rsquo; 버튼을 눌러야 반영됩니다.
          </p>

          {/* 다른 지점·브랜드 파일 오업로드 방지(2026-08-09 사고 반영) — 체크해야 저장 버튼이 풀린다 */}
          {preview.plausibility?.suspicious && (
            <div className="rounded-md p-4 text-[13px]" style={{ background: 'hsl(25 85% 45% / 0.1)' }}>
              <p className="m-0 font-medium text-foreground">
                ⚠️ {unit.label} 기존 자료와 이 파일이 많이 달라요 — 다른 지점·브랜드 파일을 잘못 고르진 않았는지 확인해주세요.
              </p>
              <ul className="m-0 mt-1 list-disc pl-4 text-muted-foreground">
                {preview.plausibility.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <label className="mt-2 flex items-center gap-2 text-foreground">
                <input type="checkbox" checked={confirmMismatch} onChange={(e) => setConfirmMismatch(e.target.checked)} />
                {unit.label}가 맞는 파일이에요 — 확인했고 그대로 저장할게요.
              </label>
            </div>
          )}

          {/* 중복 감지(2026-08-09) — 같은 파일 두 번 올리면 원본 자료함에 중복이 쌓인다는 지적 반영.
              완전히 같은 달은 저장을 눌러도 재기재·재보관 없이 건너뛴다. */}
          {previewDupYms.length > 0 && (
            <p className="m-0 text-[13px] text-muted-foreground">
              ↷ {previewDupYms
                .map((d) => `${fmtYm(d.ym)}${d.lastUploadedAt ? `(${fmtDt(d.lastUploadedAt)}에 올린 자료와 동일)` : '(이미 동일한 자료 있음)'}`)
                .join(', ')}
              — 저장을 눌러도 이 달들은 그대로 건너뛰어요.
            </p>
          )}

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

          {/* 카테고리별만으론 이상 여부가 안 보인다는 지적(2026-08-09) — 상품별·일별 요약을 추가로
              보여준다. 상품×일자 통짜 표는 여러 달치면 수백~수천 줄이라 오히려 못 읽어서,
              상품별 총계 + 일별 총계 두 표로 나눴다. 둘 다 스크롤 — 기간이 길면 줄이 많다. */}
          {preview.byProduct && preview.byProduct.length > 0 && (
            <div>
              <p className="m-0 mb-2 text-[13px] text-muted-foreground">상품별 합계(전체 기간, 매출 많은 순)</p>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-background">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                      <th className="px-3 py-2 text-left font-normal">카테고리</th>
                      <th className="px-3 py-2 text-left font-normal">상품명</th>
                      <th className="px-3 py-2 text-right font-normal">수량</th>
                      <th className="px-3 py-2 text-right font-normal">공급가액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.byProduct.map((p) => (
                      <tr key={`${p.category}|${p.product}`} className="border-t border-border">
                        <td className="px-3 py-1.5 text-muted-foreground">{p.category}</td>
                        <td className="px-3 py-1.5 text-foreground">{p.product}</td>
                        <td className="px-3 py-1.5 text-right tabular text-muted-foreground">{p.qty.toLocaleString('ko-KR')}</td>
                        <td className="px-3 py-1.5 text-right tabular text-foreground">{won(p.supply)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.byDay && preview.byDay.length > 0 && (
            <div>
              <p className="m-0 mb-2 text-[13px] text-muted-foreground">일별 합계(날짜순, {preview.byDay.length}일)</p>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-background">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                      <th className="px-3 py-2 text-left font-normal">날짜</th>
                      <th className="px-3 py-2 text-right font-normal">건수</th>
                      <th className="px-3 py-2 text-right font-normal">공급가액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.byDay.map((d) => (
                      <tr key={d.date} className="border-t border-border">
                        <td className="px-3 py-1.5 text-foreground">{d.date}</td>
                        <td className="px-3 py-1.5 text-right tabular text-muted-foreground">{d.qty.toLocaleString('ko-KR')}</td>
                        <td className="px-3 py-1.5 text-right tabular text-foreground">{won(d.supply)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mapping && (
            <p className="text-[13px] text-muted-foreground">
              페이히어 읽기 — 시트 &lsquo;{mapping.sheet}&rsquo;,{' '}
              {Object.entries(mapping.header)
                .map(([k, v]) => `${k}=${v}`)
                .join(' · ')}
            </p>
          )}

          <button
            onClick={apply}
            disabled={applying || (preview.plausibility?.suspicious && !confirmMismatch)}
            className="ta-btn-primary self-start"
          >
            {applying
              ? '저장 중…'
              : `${unit.label} ${preview.yms.map(fmtYm).join(', ')} 매출 저장`}
          </button>
        </>
      )}
    </div>
  );
}
