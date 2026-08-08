'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { brandLabel, type Brand, type ParsedTransaction } from '@/lib/finance/types';
import type { ExcelMapping } from '@/lib/finance/excel';
import { slotsForBanks, type SlotGroup, type SlotStatus } from '@/lib/finance/uploadSlots';

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
  crossFormat?: { count: number } | null; // 같은 기간 PDF 업로드 이력 — 이중 저장 경고
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

// 칸(슬롯) 우상단 필요 액션 배지 — 좌측 월 사이드바 배지와 같은 시각 언어.
// 미완료 칸마다 1 (업로드/수집 액션 1개). 부모 칸에 relative 필요.
const ActionBadge = ({ n = 1 }: { n?: number }) => (
  <span className="absolute -right-1.5 -top-1.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white">
    {n}
  </span>
);

// POS 현황(대시보드 현황 보드 전용) — 지점 키('' = 스탭밀 단일) → 상태
interface PosStatus {
  done: boolean;
  days: number;
  supply: number;
}
const POS_META: Record<string, { label: string; unit: string }> = {
  yangjae: { label: 'POS 양재천 (토스)', unit: 'yangjae' },
  pangyo: { label: 'POS 판교 (페이히어)', unit: 'pangyo' },
  '': { label: 'POS (페이히어)', unit: 'staffmeal' },
};

// 월별 회계자료 보드 — 매월 올려야 할 자료를 슬롯(To-do)로 보여준다.
// 은행 PDF·카드명세·자동수집 등 기존 경로로 들어온 것도 자동 감지해 체크한다.
// 기준 월(ym)은 상단 공용 월 선택(AccountingBoards)에서 내려받는다.
// 두 가지 모드(2026-08-01 대표 지시로 분리):
//   readOnly=true  — 대시보드 '자료 현황': 업로드 없음, 빠진 자료 확인 + 자료 입력 페이지로 이동. POS 현황 포함.
//   readOnly=false — 자료 입력 페이지: 칸 클릭으로 엑셀 업로드(기존 동작).
export default function MonthlyUploadBoard({
  ym,
  brand = 'garden',
  readOnly = false,
  unitId,
  initialBanks,
  onSaved,
}: {
  ym: string;
  brand?: Brand;
  readOnly?: boolean;
  unitId?: string; // 현황 모드에서 '자료 입력' 이동 대상 단위(staffmeal|yangjae|pangyo)
  initialBanks?: string[]; // 브랜드 고정 페이지에서 서버가 미리 읽은 사용 은행 — 첫 렌더 깜빡임 방지
  onSaved?: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);
  const [slots, setSlots] = useState<Record<string, SlotStatus> | null>(null);
  // 브랜드별 사용 은행 — 상태 API 응답으로 갱신. null = 미로드(전체 슬롯 표시)
  const [banks, setBanks] = useState<string[] | null>(initialBanks ?? null);
  const [pos, setPos] = useState<Record<string, PosStatus> | null>(null);
  // 분류·월확정 현황 — 칸 배지 합이 좌측 월 배지와 일치하도록 같은 규칙으로 서버에서 집계
  const [classify, setClassify] = useState<{ total: number; sources: number } | null>(null);
  const [monthClose, setMonthClose] = useState<{ confirmed: boolean } | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = useCallback(async (target: string) => {
    try {
      const res = await fetch(`/api/finance/excel/status?ym=${target}&brand=${brand}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '상태를 불러오지 못했어요.');
      setSlots(j.slots as Record<string, SlotStatus>);
      setBanks((j.banks as string[] | undefined) ?? null);
      setPos((j.pos as Record<string, PosStatus> | undefined) ?? null);
      setClassify((j.classify as { total: number; sources: number } | undefined) ?? null);
      setMonthClose((j.close as { confirmed: boolean } | undefined) ?? null);
      setError(null);
    } catch (e) {
      setSlots(null);
      setError((e as Error).message);
    }
  }, [brand]);

  useEffect(() => {
    setSlots(null);
    loadStatus(ym);
  }, [ym, brand, loadStatus]);

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
      fd.append('brand', brand); // 교차 형식(PDF↔엑셀) 경고 판정용
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
      fd.append('brand', brand);
      const res = await fetch('/api/finance/excel/save', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장에 실패했어요.');
      const label = SLOTS.find((s) => s.key === activeSlot)?.label ?? '';
      setNotice(
        j.saved === 0
          ? `${label} — 모두 이미 저장된 거래예요. 슬롯은 완료로 표시했어요.`
          : `${label} ${j.saved}건 저장 (자동분류 ${j.autoClassified}건${j.duplicates ? ` · 중복 ${j.duplicates}건 제외` : ''}${j.blockedConfirmed ? ` · 확정월 ${j.blockedConfirmed}건 제외` : ''})`
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

  // 이 브랜드가 쓰는 슬롯만 — 사용 은행 설정(brand_settings)에서 꺼진 은행 슬롯은 표시·집계 제외
  const SLOTS = slotsForBanks(banks);
  const doneCount = slots ? SLOTS.filter((s) => slots[s.key]?.done && slots[s.key]?.full).length : 0;
  const partialCount = slots ? SLOTS.filter((s) => slots[s.key]?.done && !slots[s.key]?.full).length : 0;
  const activeLabel = SLOTS.find((s) => s.key === activeSlot)?.label ?? '';

  // 현황 모드의 '자료 입력' 이동 대상
  const uploadHref = `/finance/upload/${unitId ?? (brand === 'staffmeal' ? 'staffmeal' : 'yangjae')}`;
  // POS 체크리스트 — 현황(대시보드) 모드는 브랜드의 전 지점, 업로드(자료 입력) 모드는 자기 단위 지점만.
  // 업로드 모드에서 빠진 POS 칸을 누르면 같은 페이지의 POS 업로더(#pos)로 이동한다.
  const posEntries = (pos ? Object.entries(pos).filter(([k]) => POS_META[k]) : []).filter(
    ([k]) => readOnly || !unitId || POS_META[k].unit === unitId,
  );
  const posDone = posEntries.filter(([, v]) => v.done).length;
  // 분류·확정 칸도 완료 카운트에 포함 (personal 등 확정 개념 없는 응답이면 제외)
  const extraTotal = (classify ? 1 : 0) + (monthClose ? 1 : 0);
  const extraDone = (classify && classify.total === 0 ? 1 : 0) + (monthClose?.confirmed ? 1 : 0);
  const totalSlots = SLOTS.length + posEntries.length + extraTotal;
  const totalDone = doneCount + posDone + extraDone;

  return (
    <section id="monthly-board" className="scroll-mt-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[15px] font-medium">
          {brandLabel(brand)} · {readOnly ? '월별 자료 현황' : '월별 회계자료 업로드'}
          {slots && (
            <span className={`ml-2 text-[12px] font-normal ${totalDone === totalSlots ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              {totalDone}/{totalSlots} 완료{partialCount > 0 && <span className="text-amber-600"> · 부분 {partialCount}</span>}
            </span>
          )}
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {readOnly ? (
          <>
            이 달에 필요한 자료가 다 들어왔는지 확인하는 화면이에요. 점선 칸 = 아직 없는 자료 — 누르면{' '}
            <Link href={uploadHref} className="underline">자료 입력</Link>으로 이동해요. 업로드는 자료 입력에서만 해요.
          </>
        ) : (
          <>
            매월 올려야 할 자료예요. 칸을 눌러 엑셀(.xlsx/.csv)을 올리면 AI가 양식과 무관하게 읽어 거래로
            넣고, 올린 칸은 체크돼요. 저장된 거래는 <Link href="/finance/classify" className="underline">지출 자료 분류</Link>에서 계정을 지정해요.
          </>
        )}
      </p>

      {!readOnly && (
        <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      )}

      <div className={`mt-4 grid gap-4 sm:grid-cols-2 ${posEntries.length > 0 ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {GROUPS.map((group) => (
          <div key={group}>
            <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{group}</div>
            <div className="flex flex-col gap-2">
              {SLOTS.filter((s) => s.group === group).map((s) => {
                const st = slots?.[s.key];
                const busy = parsing && activeSlot === s.key;
                if (s.auto) {
                  // 네이버 — 매일 자동수집 소스: 칸 클릭은 업로드가 아니라 지출 자료 분류(네이버 필터)로
                  // 이동한다. 이 달 수집 건수를 숫자로 표기하고, 엑셀 추가 업로드는 보조(+)로만 남긴다.
                  return (
                    <Link
                      key={s.key}
                      href={`/finance/classify?ym=${ym}&source=${s.key === 'coupang' ? 'coupang' : 'naverpay'}&brand=${brand}`}
                      className={`relative flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 transition-colors hover:border-foreground/40 ${
                        st?.done ? 'border-border bg-muted/40' : 'border-dashed border-border bg-background'
                      }`}
                    >
                      {slots && !st?.done && <ActionBadge />}
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        {st?.done && <span className="text-emerald-600">✓</span>}
                        {s.label}
                      </span>
                      <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        {!slots ? (
                          '확인 중…'
                        ) : busy ? (
                          '읽는 중…'
                        ) : (
                          <>
                            <b className="tabular-nums text-foreground">{st?.count ?? 0}건</b>
                            {st?.done ? ' 자동 수집' : ' 수집 전'} · 분류 보기 →
                          </>
                        )}
                        {!readOnly && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              pickSlot(s.key);
                            }}
                            className="rounded border border-border px-1.5 py-0.5 hover:text-foreground"
                            title="엑셀 파일 추가 업로드"
                          >
                            +
                          </button>
                        )}
                      </span>
                    </Link>
                  );
                }
                if (st?.done && st.full) {
                  // 완료 칸 클릭 = 이 달·이 슬롯의 거래 내역 보기(지출 자료 분류, 은행/카드 필터).
                  // 추가 업로드는 보조(+)로.
                  const viewHref = `/finance/classify?ym=${ym}&brand=${brand}${s.bank ? `&bank=${s.bank}` : '&source=card'}`;
                  return (
                    <Link
                      key={s.key}
                      href={viewHref}
                      title={`${fmtYm(ym)} ${s.label} 거래 내역 보기`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 opacity-70 transition-opacity hover:opacity-100"
                    >
                      <span className="flex items-center gap-2 text-[13px]">
                        <span className="text-emerald-600">✓</span>
                        <span className="text-muted-foreground line-through">{s.label}</span>
                      </span>
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {st.count > 0 && `${st.count}건`}
                        {st.via === 'auto' ? ' · 자동 반영' : st.at ? ` · ${fmtDay(st.at)}` : ''}
                        <span>· 내역 →</span>
                        {!readOnly && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              pickSlot(s.key);
                            }}
                            className="rounded border border-border px-1.5 py-0.5 hover:text-foreground"
                            title="추가 파일 올리기"
                          >
                            +
                          </button>
                        )}
                      </span>
                    </Link>
                  );
                }
                if (st?.done && !st.full) {
                  // 부분 업로드 — 월 일부 구간만 덮음. 이어서 올리면 합집합으로 재판정.
                  const partialInner = (
                    <>
                      <ActionBadge />
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        <span className="text-amber-600">◐</span>
                        {s.label}
                      </span>
                      <span className="text-right text-[12px]">
                        <span className="font-medium text-amber-600">{st.range ?? '일부'}만 올라옴</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {readOnly ? '자료 입력에서 이어서 →' : busy ? '읽는 중…' : '이어서 업로드 →'}
                        </span>
                      </span>
                    </>
                  );
                  const partialCls =
                    'relative flex items-center justify-between gap-2 rounded-xl border border-dashed border-amber-500/60 bg-amber-500/5 px-3.5 py-2.5 text-left transition-colors hover:border-amber-600 disabled:opacity-60';
                  return readOnly ? (
                    <Link key={s.key} href={uploadHref} className={partialCls}>{partialInner}</Link>
                  ) : (
                    <button key={s.key} onClick={() => pickSlot(s.key)} disabled={parsing} className={partialCls}>
                      {partialInner}
                    </button>
                  );
                }
                const emptyInner = (
                  <>
                    {slots && <ActionBadge />}
                    <span className="text-[13px] font-medium">{s.label}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {readOnly ? '없음 — 자료 입력에서 올리기 →' : busy ? '읽는 중…' : !slots ? '확인 중…' : '업로드 →'}
                    </span>
                  </>
                );
                const emptyCls =
                  'relative flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-background px-3.5 py-2.5 text-left transition-colors hover:border-foreground/40 disabled:opacity-60';
                return readOnly ? (
                  <Link key={s.key} href={uploadHref} className={emptyCls}>{emptyInner}</Link>
                ) : (
                  <button key={s.key} onClick={() => pickSlot(s.key)} disabled={parsing || !slots} className={emptyCls}>
                    {emptyInner}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {/* POS 매출 체크 — 현황 모드는 브랜드 전 지점, 업로드 모드는 이 단위 지점(빠졌으면 #pos 업로더로) */}
        {posEntries.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">매출 (POS)</div>
            <div className="flex flex-col gap-2">
              {posEntries.map(([storeKey, p]) => {
                const meta = POS_META[storeKey];
                if (p.done) {
                  // 업로드(자료 입력) 모드는 칸 클릭 = 위 POS 업로더로(추가·재업로드) —
                  // 손익 이동은 현황(대시보드) 모드에서만. '올리려고 눌렀는데 관리손익으로 감' 방지.
                  return (
                    <Link
                      key={storeKey}
                      href={readOnly ? `/finance/pnl?ym=${ym}&brand=${brand}${storeKey ? `&store=${storeKey}` : ''}` : '#pos'}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 opacity-80 transition-colors hover:border-foreground/40"
                    >
                      <span className="flex items-center gap-2 text-[13px]">
                        <span className="text-emerald-600">✓</span>
                        <span className="text-muted-foreground">{meta.label}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {p.days}일 · {won(p.supply)} · {readOnly ? '손익 보기 →' : '위 업로더에서 추가 ↑'}
                      </span>
                    </Link>
                  );
                }
                return (
                  <Link
                    key={storeKey}
                    href={readOnly ? `/finance/upload/${meta.unit}` : '#pos'}
                    className="relative flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-background px-3.5 py-2.5 transition-colors hover:border-foreground/40"
                  >
                    <ActionBadge />
                    <span className="text-[13px] font-medium">{meta.label}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {readOnly ? '없음 — 자료 입력에서 올리기 →' : '없음 — 위 POS 업로더에서 올리기 ↑'}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {/* 분류·월 확정 — 업로드 다음의 마감 업무. 이 칸들 배지까지 합치면 좌측 월 배지와 일치한다 */}
        {(classify || monthClose) && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">분류 · 확정</div>
            <div className="flex flex-col gap-2">
              {classify &&
                (classify.total === 0 ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5 opacity-70">
                    <span className="flex items-center gap-2 text-[13px]">
                      <span className="text-emerald-600">✓</span>
                      <span className="text-muted-foreground line-through">지출 자료 분류</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">미분류 없음</span>
                  </div>
                ) : (
                  <Link
                    href={`/finance/classify?ym=${ym}&brand=${brand}`}
                    className="relative flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-background px-3.5 py-2.5 transition-colors hover:border-foreground/40"
                  >
                    <ActionBadge n={classify.sources} />
                    <span className="text-[13px] font-medium">지출 자료 분류</span>
                    <span className="text-[12px] text-muted-foreground">
                      미분류 <b className="tabular-nums text-foreground">{classify.total}건</b> · 분류하기 →
                    </span>
                  </Link>
                ))}
              {monthClose &&
                (monthClose.confirmed ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5 opacity-70">
                    <span className="flex items-center gap-2 text-[13px]">
                      <span className="text-emerald-600">✓</span>
                      <span className="text-muted-foreground line-through">월 확정</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">확정됨</span>
                  </div>
                ) : (
                  <Link
                    href={`/finance/close?unit=${unitId ?? (brand === 'staffmeal' ? 'staffmeal' : 'yangjae')}`}
                    className="relative flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-background px-3.5 py-2.5 transition-colors hover:border-foreground/40"
                  >
                    <ActionBadge />
                    <span className="text-[13px] font-medium">월 확정</span>
                    <span className="text-[12px] text-muted-foreground">미확정 — 확정하기 →</span>
                  </Link>
                ))}
            </div>
          </div>
        )}
      </div>

      {!readOnly && preview && activeSlot && (
        <div className="mt-4 rounded-xl bg-muted/40 p-4">
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
              ⚠ {fmtYm(ym)} 밖의 거래가 {preview.outOfMonth}건 있어요. 다른 달 파일이 아닌지 확인하세요. (거래는 각자 실제 날짜의 달로 들어가고, 그 달의 칸에도 자동 반영돼요)
            </p>
          )}
          {(preview.crossFormat?.count ?? 0) > 0 && (
            <p className="mt-2 text-[12px] text-amber-600">
              ⚠ 이 기간에 <b>PDF로 올린 이력</b>이 있어요. 형식이 다르면 중복이 걸러지지 않아 같은 거래가 이중
              저장될 수 있어요 — 같은 계좌 내역이면 저장 전에 업로드 이력을 확인하세요.
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
