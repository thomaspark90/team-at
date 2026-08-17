import type { SupabaseClient } from '@supabase/supabase-js';
import { UPLOAD_SLOTS, slotsForBanks, type UploadSlot } from './uploadSlots';
import { monthCoverage, type DayInterval } from './coverage';

const toYm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const lastDayOf = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

// ---------- 공용 수집기 ----------
// 월 배지(computeBoardTodos)와 전체 현황 매트릭스(computeBoardMatrix)가 같은 데이터·같은
// 규칙을 쓰도록 집계를 한곳에 모은다 — 두 화면의 숫자가 어긋나는 사고 방지.
interface SlotCover {
  intervals: DayInterval[];
  periodless: boolean;
}
interface BoardData {
  months: string[]; // 과거 24개월 ~ 다음 달 (과거→미래)
  currentYm: string;
  prevYm: string;
  slots: UploadSlot[]; // 브랜드 사용 은행(brand_settings) 반영된 요구 슬롯
  posStores: string[];
  posByYm: Map<string, Set<string>>;
  confirmed: Set<string>;
  slotAcc: Map<string, Map<string, SlotCover>>;
  perMonth: Map<string, Record<string, { total: number; uncl: number }>>;
}

// Supabase 기본 응답 상한(1,000행) 회피 — 전 행을 페이지로 나눠 끝까지 수집.
// 잘린 채 집계하면 상한 밖의 달이 '미입력'으로 오표시된다(2026-01 POS 오탐 원인).
// build 가 매 페이지 새 쿼리를 만들어야 하고, 순서 고정용 order 는 build 안에서 건다.
// ⚠️ 프로젝트 Max Rows(Settings→API, 2026-08-09 기준 20000) 이하로 유지 — 넘으면 응답이
// 조용히 잘려 달이 '미입력'으로 오표시된다. 왕복 1회당 1~2초라 낮게 잡을수록(예전 1000) 느려진다.
const FETCH_PAGE = 20000;
type QueryResult<T> = { data: T[] | null; error: { message: string } | null };
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<QueryResult<T>>): Promise<QueryResult<T>> {
  const all: T[] = [];
  for (let from = 0; ; from += FETCH_PAGE) {
    const { data, error } = await build(from, from + FETCH_PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < FETCH_PAGE) break;
  }
  return { data: all, error: null };
}

// store 지정(가든 지점 페이지) 시 POS 요구를 그 지점만으로 좁힌다 — 각 지점 페이지는
// 자기 지점 POS 자료만 요청(2026-08-08). 미지정이면 브랜드 전 지점(대시보드 등 기존 동작).
async function collectBoardData(supabase: SupabaseClient, brand?: string, store?: string): Promise<BoardData> {
  const now = new Date();
  const currentYm = toYm(now);
  const prevYm = toYm(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const months: string[] = [];
  for (let i = -24; i <= 1; i++) months.push(toYm(new Date(now.getFullYear(), now.getMonth() + i, 1)));

  const fin = () => supabase.schema('finance');
  const closesSel = fetchAll((a, b) => {
    const q = fin().from('monthly_close').select('ym,status,store');
    return (brand ? q.eq('brand', brand) : q).order('ym').range(a, b);
  });
  const uploadsSel = fetchAll((a, b) => {
    const q = fin().from('uploads').select('slot,slot_ym,bank,source,period_start,period_end');
    return (brand ? q.eq('brand', brand) : q).order('id').range(a, b);
  });
  const txSel = fetchAll((a, b) => {
    const q = fin().from('transactions').select('ym,source,category_id,bank');
    return (brand ? q.eq('brand', brand) : q).order('id').range(a, b);
  });
  // POS 매출은 브랜드 지정 시에만 포함 — 보드의 POS 칸과 합이 맞도록. (전역 모드는 기존 동작 유지)
  const posSel =
    brand && brand !== 'personal'
      ? fetchAll((a, b) => fin().from('pos_sales').select('ym,store').eq('brand', brand).order('id').range(a, b))
      : Promise.resolve({ data: [], error: null });
  // 브랜드별 사용 은행(brand_settings) — 안 쓰는 은행 슬롯은 집계에서 제외.
  // 조회 실패(테이블 미생성 등)·전역 모드는 전체 슬롯 유지.
  const banksSel = supabase.schema('finance').from('brand_settings').select('banks').eq('brand', brand ?? '').maybeSingle();
  const [closesQ, uploadsQ, txQ, posQ, banksQ] = await Promise.all([
    closesSel,
    uploadsSel,
    txSel,
    posSel,
    brand ? banksSel : Promise.resolve({ data: null, error: null }),
  ]);
  if (uploadsQ.error) throw new Error(uploadsQ.error.message);
  if (txQ.error) throw new Error(txQ.error.message);
  const brandBanks = (banksQ.data as { banks?: string[] } | null)?.banks;
  const slots = brand && !banksQ.error && brandBanks?.length ? slotsForBanks(brandBanks) : UPLOAD_SLOTS;

  const posByYm = new Map<string, Set<string>>();
  for (const p of posQ.data ?? []) {
    const ym = String(p.ym);
    if (!posByYm.has(ym)) posByYm.set(ym, new Set());
    posByYm.get(ym)!.add(String(p.store ?? ''));
  }
  // 가든 POS = 양재천(토스)만 — 판교 페이히어는 가든 회계와 무관해 요구 목록에서 제외(2026-08-17 대표 지시).
  const posStores =
    brand === 'garden' ? (store === 'pangyo' ? [] : ['yangjae']) : brand === 'staffmeal' ? [''] : [];

  // 월확정은 단위별 (ym,brand,store) — 가든은 양재천·판교 둘 다 확정돼야 그 달 완료.
  // 그 외(스탭밀 등·브랜드 미지정 전역)는 확정 행이 있으면 완료(기존 동작 유지).
  const confirmedRows = (closesQ.data ?? []).filter((c) => c.status === 'confirmed');
  let confirmed: Set<string>;
  if (brand === 'garden') {
    const byYm = new Map<string, Set<string>>();
    for (const c of confirmedRows) {
      const ym = String(c.ym);
      if (!byYm.has(ym)) byYm.set(ym, new Set());
      byYm.get(ym)!.add(String(c.store ?? ''));
    }
    confirmed = new Set(
      Array.from(byYm.entries())
        .filter(([, stores]) => stores.has('yangjae') && stores.has('pangyo'))
        .map(([ym]) => ym)
    );
  } else {
    confirmed = new Set(confirmedRows.map((c) => String(c.ym)));
  }

  // 월·슬롯별 수집 — 보드 업로드(slot 기록)는 slot_ym 달 + 파일 기간이 겹치는 모든 달에,
  // 기존 경로(slot 없음)는 기간 겹침으로 자동 감지해 반영한다.
  // 기간 구간을 모아 커버리지(부분 업로드는 미완료로 집계)까지 판정한다.
  const slotAcc = new Map<string, Map<string, SlotCover>>();
  const mark = (ym: string, key: string, iv: DayInterval | null) => {
    if (!slotAcc.has(ym)) slotAcc.set(ym, new Map());
    const m = slotAcc.get(ym)!;
    if (!m.has(key)) m.set(key, { intervals: [], periodless: false });
    if (iv) m.get(key)!.intervals.push(iv);
    else m.get(key)!.periodless = true;
  };
  for (const u of uploadsQ.data ?? []) {
    const iv =
      u.period_start && u.period_end ? { start: String(u.period_start), end: String(u.period_end) } : null;
    if (u.slot) {
      const slotYm = u.slot_ym ? String(u.slot_ym) : null;
      if (slotYm) mark(slotYm, String(u.slot), iv);
      if (iv) {
        for (const ym of months) {
          if (ym !== slotYm && iv.start.slice(0, 7) <= ym && ym <= iv.end.slice(0, 7)) mark(ym, String(u.slot), iv);
        }
      }
      continue;
    }
    const key =
      u.source === 'card' ? 'card_main' : u.bank === 'shinhan' ? 'bank_shinhan' : u.bank === 'woori' ? 'bank_woori' : null;
    if (!key || !iv) continue;
    for (const ym of months) {
      if (iv.start.slice(0, 7) <= ym && ym <= iv.end.slice(0, 7)) mark(ym, key, iv);
    }
  }

  // 월·출처별 거래/미분류 집계 + 자동수집(네이버·쿠팡, bank 필드 기준) 존재 여부
  const perMonth = new Map<string, Record<string, { total: number; uncl: number }>>();
  const autoCollected = new Map<string, { naverpay: boolean; coupang: boolean }>();
  for (const t of txQ.data ?? []) {
    const ym = String(t.ym);
    const src = String(t.source ?? 'bank');
    if (!perMonth.has(ym)) perMonth.set(ym, {});
    const bucket = perMonth.get(ym)!;
    bucket[src] = bucket[src] ?? { total: 0, uncl: 0 };
    bucket[src].total++;
    if (t.category_id == null) bucket[src].uncl++;
    const bk = String(t.bank ?? '');
    if (bk === 'naverpay' || bk === 'coupang') {
      const a = autoCollected.get(ym) ?? { naverpay: false, coupang: false };
      a[bk as 'naverpay' | 'coupang'] = true;
      autoCollected.set(ym, a);
    }
  }

  // 자동수집(네이버·쿠팡) = 거래가 있으면 월 전체로 간주 — 보드 상태 API와 동일 규칙
  for (const ym of months) {
    const auto = autoCollected.get(ym);
    for (const key of ['naverpay', 'coupang'] as const) {
      if (auto?.[key]) mark(ym, key, { start: `${ym}-01`, end: lastDayOf(ym) });
    }
  }

  return { months, currentYm, prevYm, slots, posStores, posByYm, confirmed, slotAcc, perMonth };
}

// 슬롯 한 칸의 상태 — 보드·배지·매트릭스 공통 판정
export type SlotState = 'full' | 'partial' | 'missing';
function slotState(d: BoardData, ym: string, key: string): SlotState {
  const a = d.slotAcc.get(ym)?.get(key);
  if (!a) return 'missing';
  if (a.intervals.length === 0) return a.periodless ? 'full' : 'missing'; // 기간 없는 구버전 기록 = 완료 간주
  const cov = monthCoverage(ym, a.intervals);
  return cov.full ? 'full' : cov.label ? 'partial' : 'missing';
}

// ---------- 월 스트립 배지 — 월별 남은 업무 수 일괄 집계 ----------
// 남은 업무 = 미완료 업로드 슬롯 + 미분류가 남은 출처 수 + 월 확정(자료 있고 미확정이면 1) + POS 미입력 지점.
// 확정된 달·이번 달 이후·자료 없는 옛날 달은 0 (배지 없음).
// brand 지정 시 그 브랜드 몫만 집계(페이지가 브랜드 고정) — 미지정은 전 브랜드 합산(구버전 호환).
// store 지정(가든 지점 페이지) 시 POS 항목은 그 지점만 집계.
export async function computeBoardTodos(
  supabase: SupabaseClient,
  brand?: string,
  store?: string
): Promise<Record<string, number>> {
  const d = await collectBoardData(supabase, brand, store);
  const counts: Record<string, number> = {};
  for (const ym of d.months) {
    const sources = d.perMonth.get(ym) ?? {};
    const hasData = Object.values(sources).some((s) => s.total > 0);

    if (ym >= d.currentYm || d.confirmed.has(ym) || (!hasData && ym !== d.prevYm)) {
      counts[ym] = 0;
      continue;
    }
    // 완료 = 올라갔고(커버리지 판정 가능하면) 월 전체를 덮음 — 부분(◐)은 남은 업무로 집계
    const uploadOpen = d.slots.filter((s) => slotState(d, ym, s.key) !== 'full').length;
    const classifyOpen = Object.values(sources).filter((s) => s.uncl > 0).length;
    // 개인(personal)은 월확정 개념이 없다(확정 화면에서 제외되는 단위)
    const closeOpen = brand === 'personal' ? 0 : hasData ? 1 : 0;
    // POS 매출 미입력 지점 수 (브랜드 지정 시에만 — 보드 POS 칸과 동일 규칙)
    const posOpen = d.posStores.filter((s) => !d.posByYm.get(ym)?.has(s)).length;
    counts[ym] = uploadOpen + classifyOpen + closeOpen + posOpen;
  }
  return counts;
}

// ---------- 월별 미분류 건수 — 분류 화면 사이드바 배지용 ----------
// 배지 의미를 화면 목적에 맞춘다(2026-08-03 대표 지시): 자료 입력=남은 업무 수,
// 분류 화면=그 달의 미분류 '건수'(화면에서 실제로 처리할 개수와 일치).
export async function computeUnclassifiedByMonth(
  supabase: SupabaseClient,
  brand?: string
): Promise<Record<string, number>> {
  const { data, error } = await fetchAll<{ ym: string }>((a, b) => {
    const s = supabase.schema('finance').from('transactions').select('ym').is('category_id', null);
    return (brand ? s.eq('brand', brand) : s).order('id').range(a, b);
  });
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[String(r.ym)] = (counts[String(r.ym)] ?? 0) + 1;
  return counts;
}

// ---------- 전체 현황 매트릭스 — 행=연·월, 열=자료 종류 ----------
// 자료가 있는 첫 달부터 이번 달까지, 모든 칸의 상태를 한 번에 반환한다(자료 입력 페이지 조망용).
export interface MatrixMonth {
  ym: string;
  hasData: boolean; // 그 달 거래 존재 여부
  slots: Record<string, SlotState>;
  pos: Record<string, boolean>; // store('' = 단일) → 매출 존재
  uncl: number; // 미분류 건수(전 출처 합)
  confirmed: boolean;
}
export interface BoardMatrix {
  rows: MatrixMonth[]; // 과거 → 최신
  slots: { key: string; label: string }[];
  posStores: string[];
}
// store 지정(가든 지점 페이지) 시 POS 열은 그 지점만 노출.
export async function computeBoardMatrix(supabase: SupabaseClient, brand?: string, store?: string): Promise<BoardMatrix> {
  const d = await collectBoardData(supabase, brand, store);
  const hasAny = (ym: string) =>
    Object.values(d.perMonth.get(ym) ?? {}).some((s) => s.total > 0) ||
    (d.slotAcc.get(ym)?.size ?? 0) > 0 ||
    (d.posByYm.get(ym)?.size ?? 0) > 0;
  const first = d.months.find(hasAny) ?? d.currentYm;

  const rows: MatrixMonth[] = [];
  for (const ym of d.months) {
    if (ym < first || ym > d.currentYm) continue;
    const sources = d.perMonth.get(ym) ?? {};
    rows.push({
      ym,
      hasData: Object.values(sources).some((s) => s.total > 0),
      slots: Object.fromEntries(d.slots.map((s) => [s.key, slotState(d, ym, s.key)])),
      pos: Object.fromEntries(d.posStores.map((st) => [st, d.posByYm.get(ym)?.has(st) ?? false])),
      uncl: Object.values(sources).reduce((a, s) => a + s.uncl, 0),
      confirmed: d.confirmed.has(ym),
    });
  }
  return { rows, slots: d.slots.map((s) => ({ key: s.key, label: s.label })), posStores: d.posStores };
}
