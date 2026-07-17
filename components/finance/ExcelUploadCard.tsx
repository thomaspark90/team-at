'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { ParsedTransaction } from '@/lib/finance/types';
import type { ExcelMapping } from '@/lib/finance/excel';

interface Preview {
  mapping: ExcelMapping;
  totalRows: number;
  skipped: number;
  sumIn: number;
  sumOut: number;
  fresh: number;
  duplicates: number;
  sample: ParsedTransaction[];
}

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

// 회계자료 엑셀 업로드 — 양식 무관(.xlsx/.xls/.csv). AI가 열 배치를 판정해
// 미리보기를 보여주고, 저장하면 거래(미분류)로 들어가 거래 분류에서 계정 지정.
export default function ExcelUploadCard() {
  const fileInput = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onPick(f: File | undefined) {
    if (!f) return;
    fileRef.current = f;
    setError(null);
    setNotice(null);
    setPreview(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/finance/excel/parse', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '엑셀을 읽지 못했어요.');
      setPreview(j as Preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function save() {
    if (!preview || !fileRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', fileRef.current);
      fd.append('mapping', JSON.stringify(preview.mapping));
      const res = await fetch('/api/finance/excel/save', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장에 실패했어요.');
      setNotice(
        j.saved === 0
          ? '모두 이미 저장된 거래예요 — 새로 들어간 건이 없어요.'
          : `${j.saved}건 저장 (자동분류 ${j.autoClassified}건${j.duplicates ? ` · 중복 ${j.duplicates}건 제외` : ''})`
      );
      setPreview(null);
      fileRef.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setPreview(null);
    fileRef.current = null;
    setError(null);
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="m-0 text-[15px] font-medium">회계자료 엑셀 업로드</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        은행·카드·정산 등 거래내역 엑셀(.xlsx/.csv)을 올리면 양식과 무관하게 AI가 열을 읽어 거래로
        넣어요. 저장된 거래는 <Link href="/finance/classify" className="underline">거래 분류</Link>에서
        계정을 지정해요. 같은 내역은 다시 올려도 중복으로 걸러져요.
      </p>

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      {!preview && (
        <button
          onClick={() => fileInput.current?.click()}
          disabled={parsing}
          className="mt-4 w-full rounded-xl border border-dashed border-border bg-background py-6 text-[14px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-60 sm:w-auto sm:px-10"
        >
          {parsing ? '읽는 중…' : '📊 엑셀 파일 선택'}
        </button>
      )}

      {preview && (
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            <span>읽음 <b>{preview.totalRows}건</b></span>
            <span className="text-emerald-600">신규 <b>{preview.fresh}건</b></span>
            {preview.duplicates > 0 && <span className="text-muted-foreground">중복 {preview.duplicates}건</span>}
            {preview.skipped > 0 && <span className="text-muted-foreground">스킵 {preview.skipped}행</span>}
            <span>입금 {won(preview.sumIn)}</span>
            <span>출금 {won(preview.sumOut)}</span>
          </div>
          {preview.sample.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-[12px] text-muted-foreground">
              {preview.sample.slice(0, 5).map((t) => (
                <div key={t.dedupHash} className="flex justify-between gap-3">
                  <span className="truncate">{t.txAt.slice(0, 10)} · {t.memo}</span>
                  <span className="shrink-0 tabular-nums">
                    {t.amountOut ? `-${won(t.amountOut)}` : `+${won(t.amountIn)}`}
                  </span>
                </div>
              ))}
              {preview.fresh > 5 && <span>… 외 {preview.fresh - 5}건</span>}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={cancel}
              disabled={saving}
              className="flex-1 rounded-xl border border-border py-2.5 text-[14px] text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={saving || preview.fresh === 0}
              className="flex-[2] rounded-xl bg-foreground py-2.5 text-[14px] font-medium text-background disabled:opacity-60"
            >
              {saving ? '저장 중…' : preview.fresh === 0 ? '새 거래 없음' : `신규 ${preview.fresh}건 저장`}
            </button>
          </div>
        </div>
      )}

      {notice && <p className="mt-3 text-[13px]" style={{ color: 'hsl(var(--number-colored))' }}>{notice}</p>}
      {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
    </section>
  );
}
