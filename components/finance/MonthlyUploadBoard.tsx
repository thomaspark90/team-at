'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedTransaction } from '@/lib/finance/types';
import type { ExcelMapping } from '@/lib/finance/excel';
import { UPLOAD_SLOTS, type SlotGroup, type SlotStatus } from '@/lib/finance/uploadSlots';

interface Preview {
  mapping: ExcelMapping;
  totalRows: number;
  skipped: number;
  sumIn: number;
  sumOut: number;
  fresh: number;
  duplicates: number;
  outOfMonth: number;
  coverage: { full: boolean; label: string | null; pct: number } | null;
  continuity: {
    checked: number;
    breaks: number;
    firstBreak: { date: string; memo: string } | null;
    reliable: boolean;
  } | null;
  sample: ParsedTransaction[];
}

const GROUPS: SlotGroup[] = ['입출금 내역', '지출 세부 내역'];
const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const fmtYm = (ym: string) => `${ym.split('-')[0]}년 ${Number(ym.split('-')[1])}월`;
const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 월별 회계자료 업로드 보드 — 매월 올려야 할 자료를 슬롯(To-do)로 보여주고,
// 올린 슬롯은 체크·비활성 처리해 남은 일이 한눈에 보이게 한다.
// 은행 PDF·카드명세·네이버 자동수집 등 기존 경로로 들어온 것도 자동 감지해 체크한다.
// 기준 월(ym)은 대시보드 상단 공용 월 선택(AccountingBoards)에서 내려받고,
// 저장 성공 시 onSaved 로 알려 월 스트립 배지를 갱신하게 한다.
export default function MonthlyUploadBoard({ ym, onSaved }: { ym: string; onSaved?: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);
  const [slots, setSlots] = useState<Record<string, SlotStatus> | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = useCallback(async (target: string) => {
    try {
      const res = await fetch(`/api/finance/excel/status?ym=${target}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '상태를 불러오지 못했어요.');
      setSlots(j.slots as Record<string, SlotStatus>);
      setError(null);
    } catch (e) {
      setSlots(null);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setSlots(null);
    loadStatus(ym);
  }, [ym, loadStatus]);

  function pickSlot(key: string) {
    setActiveSlot(key);
    setNotice(null);
    setError(null);
    fileInput.current?.click();
  }

  async function onFile(f: File | undefined) {
    if (!f || !activeSlot) return;
    fileRef.current = f;
    setPreview(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('ym', ym);
      fd.append('slot', activeSlot); // 은행 슬롯이면 잔액 연속성 검사가 붙음
      const res = await fetch('/api/finance/excel/parse', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '엑셀을 읽지 못했어요.');
      setPreview(j as Preview);
    } catch (e) {
      setError((e as Error).message);
      setActiveSlot(null);
    } finally {
      setParsing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function save() {
    if (!preview || !fileRef.current || !activeSlot) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', fileRef.current);
      fd.append('mapping', JSON.stringify(preview.mapping));
      fd.append('slot', activeSlot);
      fd.append('ym', ym);
      const res = await fetch('/api/finance/excel/save', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장에 실패했어요.');
      const label = UPLOAD_SLOTS.find((s) => s.key === activeSlot)?.label ?? '';
      setNotice(
        j.saved === 0
          ? `${label} — 모두 이미 저장된 거래예요. 슬롯은 완료로 표시했어요.`
          : `${label} ${j.saved}건 저장 (자동분류 ${j.autoClassified}건${j.duplicates ? ` · 중복 ${j.duplicates}건 제외` : ''})`
      );
      setPreview(null);
      fileRef.current = null;
      setActiveSlot(null);
      loadStatus(ym);
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setPreview(null);
    fileRef.current = null;
    setActiveSlot(null);
    setError(null);
  }

  const doneCount = slots ? UPLOAD_SLOTS.filter((s) => slots[s.key]?.done && slots[s.key]?.full).length : 0;
  const partialCount = slots ? UPLOAD_SLOTS.filter((s) => slots[s.key]?.done && !slots[s.key]?.full).length : 0;
  const activeLabel = UPLOAD_SLOTS.find((s) => s.key === activeSlot)?.label ?? '';

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[15px] font-medium">
          월별 회계자료 업로드
          {slots && (
            <span className={`ml-2 text-[12px] font-normal ${doneCount === UPLOAD_SLOTS.length ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              {doneCount}/{UPLOAD_SLOTS.length} 완료{partialCount > 0 && <span className="text-amber-600"> · 부분 {partialCount}</span>}
            </span>
          )}
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        매월 올려야 할 자료예요. 칸을 눌러 엑셀(.xlsx/.csv)을 올리면 AI가 양식과 무관하게 읽어 거래로
        넣고, 올린 칸은 체크돼요. 저장된 거래는 <Link href="/finance/classify" className="underline">자료 분류</Link>에서 계정을 지정해요.
      </p>

      <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <div key={group}>
            <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{group}</div>
            <div className="flex flex-col gap-2">
              {UPLOAD_SLOTS.filter((s) => s.group === group).map((s) => {
                const st = slots?.[s.key];
                const busy = parsing && activeSlot === s.key;
                if (st?.done && st.full) {
                  return (
                    <div key={s.key} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 opacity-70">
                      <span className="flex items-center gap-2 text-[13px]">
                        <span className="text-emerald-600">✓</span>
                        <span className="text-muted-foreground line-through">{s.label}</span>
                      </span>
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {st.count > 0 && `${st.count}건`}
                        {st.via === 'auto' ? ' · 자동 반영' : st.at ? ` · ${fmtDay(st.at)}` : ''}
                        <button onClick={() => pickSlot(s.key)} className="rounded border border-border px-1.5 py-0.5 hover:text-foreground" title="추가 파일 올리기">
                          +
                        </button>
                      </span>
                    </div>
                  );
                }
                if (st?.done && !st.full) {
                  // 부분 업로드 — 월 일부 구간만 덮음. 이어서 올리면 합집합으로 재판정.
                  return (
                    <button
                      key={s.key}
                      onClick={() => pickSlot(s.key)}
                      disabled={parsing}
                      className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-amber-500/60 bg-amber-500/5 px-3.5 py-2.5 text-left transition-colors hover:border-amber-600 disabled:opacity-60"
                    >
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        <span className="text-amber-600">◐</span>
                        {s.label}
                      </span>
                      <span className="text-right text-[12px]">
                        <span className="font-medium text-amber-600">{st.range ?? '일부'}만 올라옴</span>
                        <span className="block text-[11px] text-muted-foreground">{busy ? '읽는 중…' : '이어서 업로드 →'}</span>
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    key={s.key}
                    onClick={() => pickSlot(s.key)}
                    disabled={parsing || !slots}
                    className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-background px-3.5 py-2.5 text-left transition-colors hover:border-foreground/40 disabled:opacity-60"
                  >
                    <span className="text-[13px] font-medium">{s.label}</span>
                    <span className="text-[12px] text-muted-foreground">{busy ? '읽는 중…' : !slots ? '확인 중…' : '업로드 →'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {preview && activeSlot && (
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <div className="text-[13px] font-medium">
            {fmtYm(ym)} · {activeLabel} <span className="font-normal text-muted-foreground">— 인식 결과 확인</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            <span>읽음 <b>{preview.totalRows}건</b></span>
            <span className="text-emerald-600">신규 <b>{preview.fresh}건</b></span>
            {preview.duplicates > 0 && <span className="text-muted-foreground">중복 {preview.duplicates}건</span>}
            {preview.skipped > 0 && <span className="text-muted-foreground">스킵 {preview.skipped}행</span>}
            <span>입금 {won(preview.sumIn)}</span>
            <span>출금 {won(preview.sumOut)}</span>
          </div>
          {preview.coverage && !preview.coverage.full && (
            <p className="mt-2 text-[12px] text-amber-600">
              ◐ 이 파일은 {preview.coverage.label ? `${preview.coverage.label} 구간만` : `${fmtYm(ym)} 거래 없이`} 포함해요
              (월 커버리지 {preview.coverage.pct}%). 저장은 되지만 칸은 <b>부분</b>으로 표시되고, 나머지 기간 파일을
              이어서 올리면 완료로 바뀌어요.
            </p>
          )}
          {preview.continuity && (
            preview.continuity.breaks === 0 ? (
              <p className="mt-2 text-[12px] text-emerald-600">
                ✓ 잔액 연속성 확인 — 중간 누락 없음 ({preview.continuity.checked}건 연결)
              </p>
            ) : preview.continuity.reliable ? (
              <p className="mt-2 text-[12px] text-red-500">
                ⚠ 잔액 흐름이 {preview.continuity.breaks}곳에서 끊겨요
                {preview.continuity.firstBreak &&
                  ` (첫 지점: ${preview.continuity.firstBreak.date.slice(5).replace('-', '/')} ${preview.continuity.firstBreak.memo})`}
                — 그 사이 거래가 빠졌을 수 있어요. 은행에서 전체 기간을 다시 내려받아 확인하세요.
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">
                잔액 연속성은 판정하지 못했어요 (여러 계좌가 섞였거나 정렬이 다른 파일이에요).
              </p>
            )
          )}
          {preview.outOfMonth > 0 && (
            <p className="mt-2 text-[12px] text-amber-600">
              ⚠ {fmtYm(ym)} 밖의 거래가 {preview.outOfMonth}건 있어요. 다른 달 파일이 아닌지 확인하세요. (거래는 각자 실제 날짜의 달로 들어가요)
            </p>
          )}
          {preview.sample.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-[12px] text-muted-foreground">
              {preview.sample.slice(0, 5).map((t) => (
                <div key={t.dedupHash} className="flex justify-between gap-3">
                  <span className="truncate">{t.txAt.slice(0, 10)} · {t.memo}</span>
                  <span className="shrink-0 tabular-nums">{t.amountOut ? `-${won(t.amountOut)}` : `+${won(t.amountIn)}`}</span>
                </div>
              ))}
              {preview.fresh > 5 && <span>… 외 {preview.fresh - 5}건</span>}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={cancel} disabled={saving} className="flex-1 rounded-xl border border-border py-2.5 text-[14px] text-muted-foreground hover:text-foreground disabled:opacity-60">
              취소
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-[2] rounded-xl bg-foreground py-2.5 text-[14px] font-medium text-background disabled:opacity-60"
            >
              {saving ? '저장 중…' : preview.fresh === 0 ? '완료로 표시 (새 거래 없음)' : `신규 ${preview.fresh}건 저장`}
            </button>
          </div>
        </div>
      )}

      {notice && <p className="mt-3 text-[13px]" style={{ color: 'hsl(var(--number-colored))' }}>{notice}</p>}
      {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
    </section>
  );
}
