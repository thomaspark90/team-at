'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRefresh } from '@/components/Refresh';
import { createClient } from '@/lib/supabase/client';
import { wonNum as won, fmtYm as fmtYmLabel } from '@/lib/finance/format';
import SplitModal, { type SplitTarget, type SplitRuleSuggestion } from './SplitModal';
import { useMonthCtx } from './MonthShell';
import { storeLabel, bankSourceLabel, type Brand, type Store } from '@/lib/finance/types';

export interface TxRow {
  id: number;
  memo: string;
  channel?: string | null; // naverpay: 상품명(참고 표시)
  normalized_key: string;
  amount_in: number;
  amount_out: number;
  category_id: number | null;
  tx_at: string;
  bank: string;
  source?: string;
  is_installment?: boolean;
  branch?: string | null; // naverpay: 배송지 기반 지점(1차 분류) — '판교' | '양재천' | '스탭밀'
  brand: string; // 'staffmeal' | 'garden' — 규칙 학습·키 일괄분류의 경계
  store?: string | null; // 매장 지점: 'pangyo' | 'yangjae' | null(스탭밀·미지정)
  split_parent_id?: number | null; // 건별 분할로 생긴 행이면 원거래 id
}

export interface SplitRule {
  normalized_key: string;
  brand: string;
  allocations: { brand: Brand; store: Store | null; ratio: number }[];
}
export interface Cat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
  pinned?: boolean;
}
interface Suggestion {
  categoryId: number;
  confidence: number;
  reason: string;
}

// AI '확신 항목 적용' 기준(2026-08-03 0.6→0.75 상향, 대표 지시) — 미만은 '⚠️ 확인' 추천 배지만
// 표시하고 자동 적용·규칙 학습에서 제외(오답이 규칙으로 굳는 걸 방지). 적용은 사람이 드롭다운으로.
const CONF = 0.75;
const PAGE_SIZE = 100; // 지출 자료 분류 표 페이지 크기
// Gemini billing(유료 Tier 1) 연결 확인(2026-07) → AI 추천 부활.
const AI_ENABLED = true;
const TYPE_LABEL: Record<string, string> = {
  revenue: '매출',
  cogs: '재료비(원가)',
  sga: '판매관리비',
  non_operating: '영업외',
  excluded: '손익 제외',
};
const TYPE_ORDER = ['revenue', 'cogs', 'sga', 'non_operating', 'excluded'];

export default function ClassifyPanel({
  txns,
  cats,
  userId,
  confirmed = [],
  rules = [],
  splitRules = [],
  initialFilter,
  lockedBrand = null,
  fixedUnit = null,
}: {
  txns: TxRow[];
  cats: Cat[];
  userId: string;
  confirmed?: { ym: string; brand: string; store?: string | null }[]; // 확정은 3단위 — (ym, brand, store)
  rules?: { normalized_key: string; category_id: number; brand: string }[];
  splitRules?: SplitRule[];
  initialFilter?: { ym?: string; type?: string; cat?: string; unclassified?: boolean; source?: string; brand?: string; store?: string };
  lockedBrand?: 'staffmeal' | 'garden' | null; // 브랜드 스코프 멤버 — 서버에서 해당 브랜드만 내려옴, 브랜드 탭 숨김
  // 단위 고정 뷰(내비 2단 구조) — 스탭밀/양재천점/판교점 페이지: 브랜드·지점 탭 숨김.
  // 가든 지점 단위는 '지점 미지정(공용)' 거래도 함께 보여준다 — 지정·분할로 정리해야 하는 대상이라서.
  fixedUnit?: { brand: 'staffmeal' | 'garden' | 'personal'; store: 'pangyo' | 'yangjae' | null } | null;
}) {
  // 서버 데이터 재조회 — 갱신 중 전역 인디케이터 표시
  const { refresh } = useRefresh();
  // URL 쿼리 — 서버가 initialFilter로 안 내려주는 필터(은행·검색어·페이지)의 복원용
  const sp = useSearchParams();
  // 규칙은 브랜드별 — 같은 가맹점이라도 스탭밀/가든이 다른 계정을 쓸 수 있다
  const ruleMap = new Map(rules.map((r) => [`${r.brand}|${r.normalized_key}`, r.category_id]));
  const ruleFor = (t: TxRow) => (t.normalized_key ? ruleMap.get(`${t.brand}|${t.normalized_key}`) : undefined);
  const splitRuleMap = new Map(splitRules.map((r) => [`${r.brand}|${r.normalized_key}`, r]));
  const splitRuleFor = (t: TxRow) => (t.normalized_key ? splitRuleMap.get(`${t.brand}|${t.normalized_key}`) : undefined);
  // 확정 잠금은 3단위(ym, brand, store) — 한 단위 확정이 다른 단위 분류를 막지 않는다.
  // 가든의 지점 미지정(store null) 행은 두 지점 모두 확정된 달에만 잠근다(확정 시 미지정 0건이 강제되므로 사후 유입분 보호용).
  const confirmedSet = new Set(confirmed.map((c) => `${c.ym}|${c.brand}|${c.store ?? ''}`));
  const confirmedYmsFor = (brand: string) =>
    Array.from(new Set(confirmed.filter((c) => c.brand === brand).map((c) => c.ym)));
  const confirmedYmsAll = Array.from(new Set(confirmed.map((c) => c.ym)));
  const isLocked = (tx: TxRow) => {
    const ym = tx.tx_at.slice(0, 7);
    if (tx.brand !== 'garden') return confirmedSet.has(`${ym}|${tx.brand}|`);
    if (tx.store) return confirmedSet.has(`${ym}|garden|${tx.store}`);
    return confirmedSet.has(`${ym}|garden|yangjae`) && confirmedSet.has(`${ym}|garden|pangyo`);
  };
  // 건별분할 잠금 계정(원거래 표식)
  const splitCatId = cats.find((c) => c.type === 'excluded' && c.name === '건별분할')?.id;
  const sortTxns = (arr: TxRow[]) =>
    [...arr].sort((a, b) => {
      const au = a.category_id == null ? 0 : 1;
      const bu = b.category_id == null ? 0 : 1;
      if (au !== bu) return au - bu;
      return b.tx_at.localeCompare(a.tx_at);
    });
  const [rows, setRows] = useState<TxRow[]>(() => sortTxns(txns));
  // 방금 분류한 행 id — '미분류만 보기'에서도 그 자리에 남겨 오클릭을 바로 수정할 수 있게(2026-08-03 대표 요청).
  // 서버 재조회(txns 교체) 때 비운다 — 그때는 분류가 저장 반영된 뒤라 목록에서 빠져도 자연스럽다.
  const keepVisible = useRef<Set<number>>(new Set());
  // 사이드바에서 자료 업로드 후 router.refresh() 되면 새 거래를 반영
  useEffect(() => {
    setRows(sortTxns(txns));
    keepVisible.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  // 페이지 셸(MonthShell)의 좌측 연·월 사이드바와 동기 — 사이드바에서 달을 고르면 그 달만 분류(2026-08-03).
  // 셸 밖에서 쓰이면(구 화면) 기존처럼 자체 월 셀렉트만 동작한다.
  const ctx = useMonthCtx();
  const [filterYm, setFilterYm] = useState(initialFilter?.ym ?? (ctx ? ctx.ym : 'all'));
  const ctxYm = ctx?.ym;
  useEffect(() => {
    if (ctxYm) {
      setFilterYm(ctxYm);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxYm]);
  const [filterBank, setFilterBank] = useState(sp.get('bank') ?? 'all');
  // 자금 흐름에서 넘어온 계정 필터(type/세부계정)
  const [catFilter, setCatFilter] = useState<{ type?: string; cat?: string }>({
    type: initialFilter?.type,
    cat: initialFilter?.cat,
  });
  const [srcFilter, setSrcFilter] = useState<string>(initialFilter?.source ?? 'all'); // all | bank | card | naverpay
  // 브랜드 필터(실제 brand 컬럼 기준): all | garden | staffmeal — 구 링크의 한글 값도 수용
  const legacyBrand: Record<string, string> = { 스탭밀: 'staffmeal', 가든서비스: 'garden' };
  const initBrand = initialFilter?.brand ?? '';
  const [brandFilter, setBrandFilter] = useState<string>(
    !lockedBrand && ['garden', 'staffmeal'].includes(legacyBrand[initBrand] ?? initBrand)
      ? (legacyBrand[initBrand] ?? initBrand)
      : 'all'
  );
  const [storeFilter, setStoreFilter] = useState(
    ['pangyo', 'yangjae', 'none'].includes(initialFilter?.store ?? '') ? initialFilter!.store! : 'all'
  ); // 가든 지점: all | pangyo | yangjae | none(미지정)
  const [unclOnly, setUnclOnly] = useState(!!initialFilter?.unclassified); // 미분류만 보기
  const [search, setSearch] = useState(sp.get('q') ?? ''); // 가맹점/내용 검색
  const [selected, setSelected] = useState<Set<number>>(new Set()); // 다중 선택
  const [bulkCat, setBulkCat] = useState<number | ''>(''); // 일괄 분류 카테고리
  const [page, setPage] = useState(() => Math.max(1, Number(sp.get('page')) || 1)); // 100건 단위 페이지
  // 건별 분할 모달
  const [splitTarget, setSplitTarget] = useState<SplitTarget | null>(null);
  const [splitSug, setSplitSug] = useState<SplitRuleSuggestion | null>(null);
  // 브랜드·지점 일괄 이동(재분류 소급 도구)
  const [moveBrand, setMoveBrand] = useState<'garden' | 'staffmeal' | 'personal' | ''>('');
  const [moveStore, setMoveStore] = useState<'pangyo' | 'yangjae' | ''>('');
  const [moveScope, setMoveScope] = useState<'selected' | 'key'>('selected');
  const [moving, setMoving] = useState(false);
  const [moveNotice, setMoveNotice] = useState<string | null>(null);

  const catById = new Map(cats.map((c) => [c.id, c]));
  const leafNameOf = (c: Cat) => {
    if (c.parent_id != null) {
      const p = catById.get(c.parent_id);
      if (p) return p.name;
    }
    return c.name;
  };

  const catLabel = (c: Cat) => {
    const p = cats.find((x) => x.id === c.parent_id);
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const catName = (id: number) => {
    const c = cats.find((x) => x.id === id);
    return c ? catLabel(c) : `#${id}`;
  };

  // 필터 옵션(월 목록)
  const yms = Array.from(new Set(rows.map((r) => r.tx_at.slice(0, 7)))).sort((a, b) => b.localeCompare(a));
  const banks = Array.from(new Set(rows.map((r) => r.bank)));

  // '미상' 파킹 계정 — 용도를 모르는 지출 보류함(2026-08-04 대표 요청). 사용자가 만든
  // 계정을 이름으로 감지(유형 무관), 기존에 미상으로 분류한 건들도 자동 포함된다.
  const misangCat = cats.find((c) => c.name.includes('미상'));
  const [misangOnly, setMisangOnly] = useState(false);
  const misangCount = misangCat ? rows.filter((r) => r.category_id === misangCat.id).length : 0;

  const matchesCat = (r: TxRow): boolean => {
    if (catFilter.type) {
      const c = r.category_id != null ? catById.get(r.category_id) : undefined;
      if (!c || c.type !== catFilter.type) return false;
      // cat 은 중분류(대분류명·leafNameOf) 또는 소분류(자기 이름) 둘 다 매칭
      if (catFilter.cat) return leafNameOf(c) === catFilter.cat || c.name === catFilter.cat;
      return true;
    }
    return true;
  };
  const catFilterActive = !!catFilter.type;
  const catFilterLabel = catFilter.cat ? catFilter.cat : TYPE_LABEL[catFilter.type ?? ''] ?? catFilter.type ?? '';

  const q = search.trim().toLowerCase();
  const storeMatches = (r: TxRow) =>
    storeFilter === 'all' || (storeFilter === 'none' ? r.store == null : r.store === storeFilter);
  // 단위 고정 뷰 — 스탭밀=브랜드 일치, 가든 지점=자기 지점+미지정(공용)
  const unitMatches = (r: TxRow) =>
    !fixedUnit ||
    (r.brand === fixedUnit.brand && (fixedUnit.store == null || r.store === fixedUnit.store || r.store == null));
  const filtered = rows.filter(
    (r) =>
      unitMatches(r) &&
      (filterYm === 'all' || r.tx_at.slice(0, 7) === filterYm) &&
      (filterBank === 'all' || r.bank === filterBank) &&
      (srcFilter === 'all' || (r.source ?? 'bank') === srcFilter) &&
      // 브랜드 필터 — 실제 brand 컬럼 기준(전 소스). 가든이면 지점(store) 하위 필터까지. 단위 고정 시 생략.
      (!!fixedUnit || brandFilter === 'all' || r.brand === brandFilter) &&
      (!!fixedUnit || (brandFilter !== 'garden' && lockedBrand !== 'garden') || storeMatches(r)) &&
      (!unclOnly || r.category_id == null || keepVisible.current.has(r.id)) &&
      (!misangOnly || (misangCat != null && r.category_id === misangCat.id)) &&
      (!q || r.memo.toLowerCase().includes(q) || r.normalized_key.toLowerCase().includes(q) || (r.channel ?? '').toLowerCase().includes(q)) &&
      matchesCat(r)
  );
  const classifiedCount = filtered.filter((r) => r.category_id != null).length;
  const progress = filtered.length ? Math.round((classifiedCount / filtered.length) * 100) : 0;

  // 페이지네이션 — 100건 단위, 필터가 바뀌면 1페이지로
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageStart = (curPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const filtersMounted = useRef(false);
  useEffect(() => {
    // 첫 렌더는 건너뛴다 — URL(?page=)에서 복원한 페이지가 리셋되지 않게
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setPage(1);
    // 필터를 바꾸면 '방금 분류한 행 유지'도 정리 — 미분류만 보기를 다시 켜면 진짜 미분류만 남는다
    keepVisible.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYm, filterBank, srcFilter, brandFilter, storeFilter, unclOnly, misangOnly, q, catFilter.type, catFilter.cat]);

  // 필터·페이지를 URL에 반영(얕은 갱신, 서버 재조회 없음) — 새로고침·뒤로가기에도 작업 위치 유지.
  // 셸(MonthShell navigate) 안에서는 끔 — 달 클릭으로 router.replace 전환이 진행되는 중에
  // 여기서 replaceState가 끼어들면 전환이 버려져 '두 번 눌러야 내용이 뜨는' 버그가 됨(2026-08-04).
  // URL의 ym은 셸이 관리하고, 보조 필터(출처·검색·페이지)의 URL 유지는 이 화면에선 포기.
  useEffect(() => {
    if (ctx) return;
    const url = new URL(window.location.href);
    const p = url.searchParams;
    const put = (k: string, v: string, empty: boolean) => (empty ? p.delete(k) : p.set(k, v));
    put('ym', filterYm, filterYm === 'all');
    put('bank', filterBank, filterBank === 'all');
    put('source', srcFilter, srcFilter === 'all');
    put('brand', brandFilter, brandFilter === 'all');
    put('store', storeFilter, storeFilter === 'all');
    put('type', catFilter.type ?? '', !catFilter.type);
    put('cat', catFilter.cat ?? '', !catFilter.cat);
    put('unclassified', '1', !unclOnly);
    put('q', search, !search.trim());
    put('page', String(curPage), curPage <= 1);
    window.history.replaceState(null, '', url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYm, filterBank, srcFilter, brandFilter, storeFilter, catFilter.type, catFilter.cat, unclOnly, search, curPage]);

  // 다중 선택(현재 필터·미확정 대상) — 헤더 체크박스는 현재 페이지만 선택
  const selectableIds = filtered.filter((r) => !isLocked(r)).map((r) => r.id);
  const selCount = selectableIds.filter((id) => selected.has(id)).length;
  const pageSelectableIds = pageRows.filter((r) => !isLocked(r)).map((r) => r.id);
  const allSelected = pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selected.has(id));
  const toggleSel = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allSelected) pageSelectableIds.forEach((id) => n.delete(id));
      else pageSelectableIds.forEach((id) => n.add(id));
      return n;
    });
  // 검색 결과 전체 선택 — 페이지 경계를 넘어(예: 특정 배송지 태그 검색) 한 번에 선택할 때 사용
  const allFilteredSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAllFiltered = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allFilteredSelected) selectableIds.forEach((id) => n.delete(id));
      else selectableIds.forEach((id) => n.add(id));
      return n;
    });

  async function bulkClassify(catId: number) {
    const targets = rows.filter((r) => selected.has(r.id) && !isLocked(r));
    if (!targets.length) return;
    setAiApplying(true);
    setError(null);
    const supabase = createClient();
    const now = new Date().toISOString();
    const ids = targets.map((r) => r.id);
    const { error: e1 } = await supabase
      .schema('finance')
      .from('transactions')
      .update({ category_id: catId, classified_by: userId, classified_at: now })
      .in('id', ids);
    if (e1) {
      setError(e1.message);
      setAiApplying(false);
      return;
    }
    // 선택 일괄분류는 규칙 학습 안 함(여러 가맹점 섞일 수 있음). 규칙은 개별 드롭다운에서.
    targets.forEach((r) => keepVisible.current.add(r.id));
    setRows((list) => list.map((r) => (selected.has(r.id) && !isLocked(r) ? { ...r, category_id: catId } : r)));
    setSelected(new Set());
    setBulkCat('');
    setAiApplying(false);
    ctx?.refreshTodos(); // 사이드바 배지 갱신
  }

  function openSplit(tx: TxRow) {
    const amount = tx.amount_out > 0 ? tx.amount_out : tx.amount_in;
    setSplitSug(splitRuleFor(tx) ?? null);
    setSplitTarget({ id: tx.id, memo: tx.memo, amount, brand: tx.brand, store: tx.store ?? null });
  }

  async function undoSplit(tx: TxRow) {
    if (!window.confirm(`'${tx.memo}' 분할을 해제할까요? 나눠진 행이 삭제되고 원거래는 미분류로 돌아가요.`)) return;
    setBusy(tx.id);
    setError(null);
    try {
      const res = await fetch('/api/finance/split', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txId: tx.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '분할 해제에 실패했어요.');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function moveBrandStore() {
    if (!moveBrand) return;
    const ids = Array.from(selected).filter((id) => {
      const r = rows.find((x) => x.id === id);
      return r && !isLocked(r);
    });
    if (!ids.length) return;
    setMoving(true);
    setError(null);
    setMoveNotice(null);
    try {
      const res = await fetch('/api/finance/reclassify-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          brand: moveBrand,
          store: moveBrand === 'garden' && moveStore ? moveStore : null,
          scope: moveScope,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '이동에 실패했어요.');
      setMoveNotice(`${j.moved}건 이동 완료${j.skipped ? ` · 확정월 ${j.skipped}건 제외` : ''}`);
      setSelected(new Set());
      setMoveBrand('');
      setMoveStore('');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMoving(false);
    }
  }

  // opts.single = 이 거래 한 건만 분류(키 전파·규칙 학습 없음) — '미상' 파킹처럼
  // 가맹점 전체에 학습되면 안 되는 지정에 사용
  async function classify(tx: TxRow, categoryId: number, opts?: { single?: boolean }) {
    setBusy(tx.id);
    setError(null);
    const supabase = createClient();
    const now = new Date().toISOString();
    // 플랫폼명 키('쿠팡'·'네이버페이')는 가맹점 구분력이 없어 전파하면 전 행이 덮인다
    // (2026-08-08 사고 — 기수집 레거시 행 보호. 새 수집분은 상품명 포함 키라 정상 전파).
    const generic = tx.normalized_key === '쿠팡' || tx.normalized_key === '네이버페이';
    const key = opts?.single || generic ? null : tx.normalized_key;

    // 대량 전파 가드 — 전파가 몇 건을 덮는지 보여주고 확인받는다(같은 사고의 근본 처방).
    // 임계 15건: 통상 가맹점 월 반복은 한 자릿수, 수십 건이면 키가 뭉쳤을 가능성이 크다.
    if (key) {
      const { count } = await supabase
        .schema('finance')
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('normalized_key', key)
        .eq('brand', tx.brand);
      if ((count ?? 0) >= 15) {
        const ok = window.confirm(
          `'${tx.memo}' — 같은 가맹점 거래 ${count}건에 일괄 적용되고 규칙으로 학습됩니다.\n계속할까요? (가맹점 하나치고 건수가 지나치게 많다면 키가 뭉친 것일 수 있어요)`,
        );
        if (!ok) {
          setBusy(null);
          return false;
        }
      }
    }

    let q = supabase
      .schema('finance')
      .from('transactions')
      .update({ category_id: categoryId, classified_by: userId, classified_at: now });
    // 키 기반 일괄 분류는 같은 브랜드 안에서만 — 브랜드가 다르면 계정도 다를 수 있다
    q = key ? q.eq('normalized_key', key).eq('brand', tx.brand) : q.eq('id', tx.id);
    // 이 브랜드의 확정된 달은 건드리지 않음(키 기반 분류가 여러 달에 걸칠 수 있음)
    const lockedYms = confirmedYmsFor(tx.brand);
    if (lockedYms.length) q = q.not('ym', 'in', `(${lockedYms.join(',')})`);
    const { error: e1 } = await q;
    if (e1) {
      setError(e1.message);
      setBusy(null);
      return false;
    }
    if (key) {
      await supabase
        .schema('finance')
        .from('rules')
        .upsert({ normalized_key: key, brand: tx.brand, category_id: categoryId, created_by: userId }, { onConflict: 'normalized_key,brand' });
    }
    // 오클릭 보호는 사용자가 직접 만진 행만 — 같은 키로 전파된 행까지 남기면 목록이 분류된 행으로 넘친다.
    // (남은 이 행에서 계정을 고치면 키 전파로 나머지 행도 같이 고쳐진다)
    keepVisible.current.add(tx.id);
    setRows((list) =>
      list.map((r) =>
        (key ? r.normalized_key === key && r.brand === tx.brand : r.id === tx.id) && !isLocked(r) ? { ...r, category_id: categoryId } : r
      )
    );
    setBusy(null);
    ctx?.refreshTodos(); // 사이드바 배지 갱신
    return true;
  }

  // AI 추천 범위 — 현재 화면의 브랜드 스코프와 일치시킨다(전체 보기면 전 브랜드)
  const aiBrand = fixedUnit?.brand ?? lockedBrand ?? (brandFilter !== 'all' ? brandFilter : null);

  async function fetchAI() {
    setAiLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/ai-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(aiBrand ? { brand: aiBrand } : {}), ...(filterYm !== 'all' ? { ym: filterYm } : {}) }),
      });
      // 타임아웃 등으로 JSON이 아닌 텍스트 오류(Vercel "An error…")가 올 수 있어 안전 파싱
      const raw = await res.text();
      let j: { suggestions?: unknown; failedChunks?: number; error?: string } = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.ok
            ? 'AI 응답을 읽지 못했어요. 잠시 후 다시 시도하세요.'
            : 'AI 분류가 시간 초과됐어요 — 왼쪽에서 특정 달을 골라 범위를 좁힌 뒤 다시 눌러주세요.'
        );
      }
      if (!res.ok) throw new Error(j.error || 'AI 추천에 실패했어요.');
      const map: Record<string, Suggestion> = {};
      for (const s of j.suggestions as { key: string; categoryId: number; confidence: number; reason: string }[]) {
        map[s.key] = { categoryId: s.categoryId, confidence: s.confidence, reason: s.reason };
      }
      setSuggestions(map);
      if (Object.keys(map).length === 0) setError('AI가 추천할 미분류 그룹이 없어요.');
      else if ((j.failedChunks ?? 0) > 0) setError(`일부 그룹(${j.failedChunks}묶음)은 추천에 실패했어요 — 잠시 후 다시 실행하면 이어서 추천돼요.`);
    } catch (e) {
      setError((e as Error).message);
    }
    setAiLoading(false);
  }

  async function applyConfident() {
    setAiApplying(true);
    setError(null);
    // 브랜드별로 묶어 서버에 한 번에 적용(bulk API) — 그룹마다 왕복하던 방식은
    // 2025 소급(그룹 수백 개)에서 분 단위로 걸려서 교체(2026-08-03).
    const byBrand = new Map<string, { key: string; categoryId: number }[]>();
    const seen = new Set<string>();
    for (const tx of rows) {
      if (tx.category_id != null || !tx.normalized_key) continue;
      if (aiBrand && tx.brand !== aiBrand) continue; // 추천 스코프 밖 브랜드에 오적용 방지
      const s = suggestions[tx.normalized_key];
      if (!s || s.confidence < CONF) continue;
      const k = `${tx.brand}|${tx.normalized_key}`;
      if (seen.has(k) || isLocked(tx)) continue;
      seen.add(k);
      if (!byBrand.has(tx.brand)) byBrand.set(tx.brand, []);
      byBrand.get(tx.brand)!.push({ key: tx.normalized_key, categoryId: s.categoryId });
    }
    try {
      let applied = 0;
      for (const [b, items] of Array.from(byBrand.entries())) {
        const res = await fetch('/api/finance/classify/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand: b, items }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || '일괄 적용에 실패했어요.');
        applied += Number(j.updated ?? 0);
        // 화면 반영 — 적용된 키의 미분류 행을 채운다(확정월 잠긴 행 제외, 서버도 동일 필터).
        // AI 일괄 적용은 keepVisible에 안 넣는다 — 수백 건이 미분류 보기에 남아 목록이 넘치는 부작용(2026-08-03).
        const catByKey = new Map<string, number>(items.map((i) => [i.key, i.categoryId] as [string, number]));
        setRows((list) =>
          list.map((r) =>
            r.brand === b && r.category_id == null && r.normalized_key && catByKey.has(r.normalized_key) && !isLocked(r)
              ? { ...r, category_id: catByKey.get(r.normalized_key)! }
              : r
          )
        );
      }
      if (applied === 0 && byBrand.size === 0) setError('적용할 확신 항목이 없어요.');
    } catch (e) {
      setError((e as Error).message);
    }
    setAiApplying(false);
    ctx?.refreshTodos(); // 사이드바 배지 갱신
  }

  async function resetAll() {
    const total = rows.filter((r) => r.category_id != null).length;
    if (!window.confirm(`정말 전체 초기화할까요? 지금까지 분류한 ${won(total)}건과 학습 규칙이 모두 사라져요. 되돌릴 수 없어요.`)) return;
    if (!window.confirm('한 번 더 확인할게요. 정말 모두 초기화합니다. 계속할까요?')) return;
    setAiApplying(true);
    setError(null);
    const supabase = createClient();
    let uq = supabase
      .schema('finance')
      .from('transactions')
      .update({ category_id: null, classified_by: null, classified_at: null })
      .gte('id', 0);
    // 확정된 달은 초기화에서 제외(어느 브랜드든 확정이면 보수적으로 그 달 전체 제외)
    if (confirmedYmsAll.length) uq = uq.not('ym', 'in', `(${confirmedYmsAll.join(',')})`);
    const { error: e1 } = await uq;
    if (e1) {
      setError(e1.message);
      setAiApplying(false);
      return;
    }
    await supabase.schema('finance').from('rules').delete().gte('id', 0);
    setRows((rs) => rs.map((r) => (isLocked(r) ? r : { ...r, category_id: null })));
    setSuggestions({});
    setAiApplying(false);
  }

  const unclassified = filtered.filter((r) => r.category_id == null).length;
  const hasSug = Object.keys(suggestions).length > 0;
  const confidentKeys = new Set<string>();
  for (const r of rows) {
    if (r.category_id == null && r.normalized_key && suggestions[r.normalized_key]?.confidence >= CONF)
      confidentKeys.add(r.normalized_key);
  }
  // 학습된 규칙으로 미리 선택된(미분류) 그룹 — 사람이 '적용'하면 확정
  const ruleKeys = new Set<string>();
  for (const r of rows) {
    if (r.category_id == null && r.normalized_key && !suggestions[r.normalized_key] && !isLocked(r) && ruleFor(r) != null)
      ruleKeys.add(`${r.brand}|${r.normalized_key}`);
  }
  async function applyRules() {
    setAiApplying(true);
    const seen = new Set<string>();
    for (const tx of rows) {
      if (tx.category_id != null || !tx.normalized_key || isLocked(tx) || seen.has(`${tx.brand}|${tx.normalized_key}`)) continue;
      const cat = ruleFor(tx);
      if (!cat) continue;
      seen.add(`${tx.brand}|${tx.normalized_key}`);
      await classify(tx, cat);
    }
    setAiApplying(false);
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto my-[60px] max-w-[460px] text-center text-muted-foreground">
        <div className="mb-3 text-[32px]">📭</div>
        <h2 className="mb-2 text-[15px] text-foreground">저장된 거래가 없어요</h2>
        <p className="text-[13px]">먼저 업로드 화면에서 거래내역을 저장해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-[10px]">
        {/* 월 선택은 좌측 사이드바가 전담(2026-08-04 대표 지시로 드롭다운 제거) —
            셸 밖에서 쓰일 때만 폴백으로 표시 */}
        {!ctx && (
          <select
            value={filterYm}
            onChange={(e) => setFilterYm(e.target.value)}
            className="ta-input text-[13px]"
          >
            <option value="all">전체 월</option>
            {yms.map((ym) => (
              <option key={ym} value={ym}>
                {fmtYmLabel(ym)}
              </option>
            ))}
          </select>
        )}
        {/* 출처 종류(banks)는 데이터에 따라 늘어난다 — 세그먼트가 화면 폭을 넘으면
            줄바꿈 대신 가로 스크롤(2026-08-09, 회계 내비와 동일 패턴). */}
        <div className="min-w-0 max-w-full overflow-x-auto scrollbar-hide">
          <div className="inline-flex w-max gap-1 rounded-md border border-border p-1">
            {['all', ...banks].map((b) => {
              const on = filterBank === b;
              return (
                <button
                  key={b}
                  onClick={() => setFilterBank(b)}
                  className={`shrink-0 rounded-sm px-3 py-1 text-[13px] ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {b === 'all' ? '전체 출처' : bankSourceLabel(b)}
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={() => {
            setUnclOnly((v) => !v);
            setMisangOnly(false);
          }}
          className={`rounded-md border px-3 py-[7px] text-[13px] font-medium ${
            unclOnly ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          미분류만
        </button>
        {misangCat && misangCount > 0 && (
          // 미상 모아보기 — 용도 불명으로 보류한 거래를 나중에 밝혀서 재분류하는 동선
          <button
            onClick={() => {
              setMisangOnly((v) => !v);
              setUnclOnly(false);
            }}
            className={`rounded-md border px-3 py-[7px] text-[13px] font-medium ${
              misangOnly ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            미상 {misangCount}건
          </button>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="가맹점·내용 검색"
          className="ta-input min-w-[160px] flex-1 text-[13px]"
        />
        {search.trim() && selectableIds.length > 0 && (
          <button
            onClick={toggleAllFiltered}
            className="whitespace-nowrap text-[13px] text-primary underline underline-offset-2"
          >
            {allFilteredSelected ? '검색결과 선택 해제' : `검색결과 ${selectableIds.length}건 전체 선택`}
          </button>
        )}
        {catFilterActive && (
          <button
            onClick={() => setCatFilter({})}
            title="필터 해제"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1 text-[13px] font-medium text-primary"
          >
            {catFilterLabel}만 보기
            <span className="text-[15px] leading-none">×</span>
          </button>
        )}
        {srcFilter !== 'all' && (
          <button
            onClick={() => setSrcFilter('all')}
            title="필터 해제"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1 text-[13px] font-medium text-primary"
          >
            {srcFilter === 'card'
              ? '💳 카드만 보기'
              : srcFilter === 'naverpay'
                ? '🟢 네이버 페이 지출만 보기'
                : srcFilter === 'coupang'
                  ? '📦 쿠팡 지출만 보기'
                  : '🏦 은행만 보기'}
            <span className="text-[15px] leading-none">×</span>
          </button>
        )}
        {lockedBrand && (
          // 브랜드 스코프 멤버 — 서버·RLS에서 이미 해당 브랜드만 내려옴
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-[13px] text-muted-foreground">
            {lockedBrand === 'staffmeal' ? '스탭밀 담당' : '가든서비스 담당'} · 해당 브랜드 거래만 표시
          </span>
        )}
        {fixedUnit && (
          // 단위 고정 뷰(내비 2단) — 브랜드·지점 탭 대신 단위 안내 칩
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-[13px] text-muted-foreground">
            {fixedUnit.brand === 'personal'
              ? '개인 지출만 표시 — 손익 제외(사업장 손익에 안 잡힘). 채널·월별로 확인하세요'
              : fixedUnit.brand === 'staffmeal'
              ? '스탭밀 거래만 표시'
              : `가든 ${storeLabel(fixedUnit.store)} + 지점 미지정(공용) 거래 표시 — 미지정은 지점 지정·분할로 정리해요`}
          </span>
        )}
        {!lockedBrand && !fixedUnit && (
          // 회계 단위 필터 — 브랜드+지점 2단을 한 줄로 통합(2026-08-03). 클릭 1번에 brand·store 동시 설정.
          // '가든 미지정' = 아직 지점이 안 찍힌 가든 공용(통장·카드) 거래 — 지점 지정·분할로 정리 대상.
          <div className="inline-flex flex-wrap gap-1 rounded-md border border-border p-1">
            {[
              { label: '전체', brand: 'all', store: 'all' },
              { label: '스탭밀', brand: 'staffmeal', store: 'all' },
              { label: '가든서비스(양재천점)', brand: 'garden', store: 'yangjae' },
              { label: '가든서비스(판교점)', brand: 'garden', store: 'pangyo' },
              { label: '가든 미지정', brand: 'garden', store: 'none' },
            ].map(({ label, brand, store }) => {
              const on = brandFilter === brand && (brand === 'garden' ? storeFilter === store : true);
              return (
                <button
                  key={label}
                  onClick={() => {
                    setBrandFilter(brand);
                    setStoreFilter(store);
                  }}
                  className={`rounded-sm px-3 py-1 text-[13px] ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {!fixedUnit && lockedBrand === 'garden' && (
          // 가든 스코프 멤버 — 지점 단위만 선택(브랜드는 가든 고정).
          <div className="inline-flex flex-wrap gap-1 rounded-md border border-border p-1">
            {[
              { v: 'all', label: '전체 지점' },
              { v: 'yangjae', label: '가든서비스(양재천점)' },
              { v: 'pangyo', label: '가든서비스(판교점)' },
              { v: 'none', label: '미지정' },
            ].map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setStoreFilter(v)}
                className={`rounded-sm px-3 py-1 text-[13px] ${storeFilter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-[13px] text-muted-foreground">
            <b className="text-foreground">{won(filtered.length)}건</b> · 미분류 <b className="text-foreground">{won(unclassified)}건</b> · 분류 {progress}%
          </p>
          <div className="mt-1.5 h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {AI_ENABLED && (
          <button onClick={fetchAI} disabled={aiLoading || unclassified === 0} className="ta-btn-primary text-[13px]">
            {aiLoading ? 'AI 분석 중…' : 'AI 추천 분류'}
          </button>
        )}
        {AI_ENABLED && hasSug && confidentKeys.size > 0 && (
          <button onClick={applyConfident} disabled={aiApplying} className="ta-btn-primary text-[13px]">
            {aiApplying ? '적용 중…' : `확신 항목 저장 (${confidentKeys.size}그룹)`}
          </button>
        )}
        {ruleKeys.size > 0 && (
          <button onClick={applyRules} disabled={aiApplying} className="ta-btn-primary text-[13px]">
            {aiApplying ? '적용 중…' : `학습 추천 적용 (${ruleKeys.size}그룹)`}
          </button>
        )}
        <button
          onClick={resetAll}
          disabled={aiApplying}
          title="분류·학습 규칙을 모두 초기화(되돌릴 수 없음)"
          className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-destructive disabled:opacity-50"
        >
          전체 초기화
        </button>
      </div>
      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}

      {/* 다중 선택 일괄 분류 바 */}
      {selCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary bg-primary/5 px-4 py-3">
          <span className="text-[13px] font-medium text-foreground">{selCount}건 선택됨</span>
          <select
            value={bulkCat}
            onChange={(e) => setBulkCat(e.target.value === '' ? '' : Number(e.target.value))}
            className="ta-input min-w-[190px] text-[13px]"
          >
            <option value="">카테고리 선택…</option>
            {TYPE_ORDER.map((type) => {
              const list = cats.filter((c) => c.type === type);
              if (!list.length) return null;
              return (
                <optgroup key={type} label={TYPE_LABEL[type]}>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {catLabel(c)}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <button
            onClick={() => bulkCat !== '' && bulkClassify(bulkCat)}
            disabled={bulkCat === '' || aiApplying}
            className="ta-btn-primary text-[13px]"
          >
            {aiApplying ? '적용 중…' : `${selCount}건 일괄 분류`}
          </button>
          <button onClick={() => setSelected(new Set())} className="ta-btn text-[13px]">
            선택 해제
          </button>
          {/* 브랜드·지점 이동 — 잘못 귀속된 거래를 소급 재분류하는 도구 */}
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-primary/20 pt-3">
            <span className="text-[13px] text-muted-foreground">브랜드·지점 이동:</span>
            <select
              value={moveBrand}
              onChange={(e) => {
                setMoveBrand(e.target.value as 'garden' | 'staffmeal' | 'personal' | '');
                setMoveStore('');
              }}
              className="ta-input text-[13px]"
            >
              <option value="">브랜드 선택…</option>
              <option value="garden">가든서비스</option>
              <option value="staffmeal">스탭밀</option>
              <option value="personal">개인</option>
            </select>
            {moveBrand === 'garden' && (
              <select value={moveStore} onChange={(e) => setMoveStore(e.target.value as 'pangyo' | 'yangjae' | '')} className="ta-input text-[13px]">
                <option value="">지점 미지정</option>
                <option value="pangyo">판교</option>
                <option value="yangjae">양재천</option>
              </select>
            )}
            <select value={moveScope} onChange={(e) => setMoveScope(e.target.value as 'selected' | 'key')} className="ta-input text-[13px]">
              <option value="selected">선택한 건만</option>
              <option value="key">같은 가맹점 전체 소급</option>
            </select>
            <button onClick={moveBrandStore} disabled={!moveBrand || moving} className="ta-btn-primary text-[13px]">
              {moving ? '이동 중…' : '이동'}
            </button>
            {moveScope === 'key' && (
              <span className="text-[11px] text-amber-600">선택한 거래의 가맹점 전체가 과거까지 소급 이동돼요 (확정월 제외)</span>
            )}
          </div>
        </div>
      )}
      {moveNotice && <p className="text-[13px]" style={{ color: 'hsl(var(--number-colored))' }}>{moveNotice}</p>}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <th className="w-[36px] px-3 py-2 text-left">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} title="현재 페이지 전체 선택" aria-label="현재 페이지 전체 선택" />
                </th>
                <Th right>#</Th>
                <Th>출처</Th>
                <Th>거래일자</Th>
                <Th>거래시간</Th>
                <Th right>금액</Th>
                <Th>내용</Th>
                <Th>카테고리</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((tx, rowIdx) => {
                const locked = isLocked(tx);
                const pending = tx.category_id == null;
                const sug = pending && tx.normalized_key ? suggestions[tx.normalized_key] : undefined;
                // 학습된 규칙 추천(미분류 + AI추천 없을 때) — 미리 선택돼 보이지만 확정은 사람이
                const ruleSug = pending && !sug ? ruleFor(tx) : undefined;
                const isInflow = tx.amount_in >= tx.amount_out;
                const allowed = isInflow
                  ? ['revenue', 'non_operating', 'excluded']
                  : ['cogs', 'sga', 'non_operating', 'excluded'];
                const [date, time] = tx.tx_at.split('T');
                const selVal = tx.category_id ?? sug?.categoryId ?? ruleSug ?? '';
                return (
                  <tr
                    key={tx.id}
                    className={`border-t border-border hover:bg-accent ${
                      selected.has(tx.id)
                        ? 'bg-primary/5'
                        : locked
                          ? 'bg-muted'
                          : unclOnly && tx.category_id != null
                            ? 'bg-emerald-500/5' // 미분류 보기에서 방금 분류돼 남아있는 행 — 즉시 수정 가능
                            : ''
                    }`}
                  >
                    <td className="px-3 py-2 align-middle">
                      {!locked && (
                        <input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSel(tx.id)} aria-label="선택" />
                      )}
                    </td>
                    <td className="px-2 py-2 text-right align-middle text-[11px] tabular-nums text-muted-foreground">
                      {pageStart + rowIdx + 1}
                    </td>
                    <Td>{bankSourceLabel(tx.bank)}</Td>
                    <Td mono>{date}</Td>
                    <Td mono>{time ?? ''}</Td>
                    <Td right mono>
                      {tx.amount_in > 0
                        ? <span className="text-positive">+{won(tx.amount_in)}</span>
                        : `-${won(tx.amount_out)}`}
                    </Td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex max-w-[380px] items-center gap-1.5">
                        {tx.source === 'card' && <span title="신한카드 이용내역" className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">💳</span>}
                        {tx.source === 'naverpay' && <span title="네이버페이 결제내역" className="shrink-0 rounded bg-positive/10 px-1.5 py-0.5 text-[11px] font-medium text-positive">N</span>}
                        <span
                          title="브랜드·지점 — 이 거래가 귀속된 회계 단위"
                          className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {tx.brand === 'personal'
                            ? '개인'
                            : tx.brand === 'staffmeal'
                            ? '스탭밀'
                            : `가든${tx.store ? `·${storeLabel(tx.store)}` : ''}`}
                        </span>
                        {tx.split_parent_id != null && (
                          <span title="건별 분할로 생긴 행" className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">🔀</span>
                        )}
                        <span className="line-clamp-2 min-w-0 break-all" title={tx.memo}>
                          {tx.memo || <span className="text-muted-foreground">(빈 내용)</span>}
                          {(tx.source === 'naverpay' || tx.source === 'coupang') && tx.channel && (
                            <span className="text-muted-foreground"> · {tx.channel}</span>
                          )}
                        </span>
                        {tx.is_installment && <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">할부</span>}
                      </div>
                    </td>
                    <Td>
                      {locked ? (
                        <span className="inline-flex items-center gap-[6px] text-foreground">
                          🔒 {tx.category_id ? catName(tx.category_id) : '미분류'}
                          <span className="text-[11px] text-muted-foreground">확정됨</span>
                        </span>
                      ) : splitCatId != null && tx.category_id === splitCatId ? (
                        // 건별 분할된 원거래 — 손익 제외, 자식 행들이 각자 회계에 잡힘
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[13px] text-muted-foreground">🔀 분할됨 (손익 제외)</span>
                          <button
                            onClick={() => undoSplit(tx)}
                            disabled={busy === tx.id}
                            className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-destructive"
                          >
                            {busy === tx.id ? '해제 중…' : '분할 해제'}
                          </button>
                        </span>
                      ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={selVal}
                          disabled={busy === tx.id}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (v) classify(tx, v);
                          }}
                          className={`ta-input min-w-[190px] text-[13px] ${pending ? 'border-foreground' : ''}`}
                        >
                          <option value="">미분류 — 선택…</option>
                          {(() => {
                            const pins = cats.filter((c) => c.pinned && allowed.includes(c.type));
                            return pins.length ? (
                              <optgroup label="⭐ 자주 쓰는">
                                {pins.map((c) => (
                                  <option key={`p${c.id}`} value={c.id}>
                                    {catLabel(c)}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null;
                          })()}
                          {TYPE_ORDER.filter((t) => allowed.includes(t)).map((type) => {
                            const list = cats.filter((c) => c.type === type);
                            if (!list.length) return null;
                            return (
                              <optgroup key={type} label={TYPE_LABEL[type]}>
                                {list.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {catLabel(c)}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                        {busy === tx.id && <span className="text-[11px] text-muted-foreground">저장…</span>}
                        {sug && busy !== tx.id && (
                          // AI 추천 배지 = 원클릭 확정 버튼(2026-08-04 대표 요청) — 맞으면 눌러서
                          // 바로 적용(같은 가맹점 전파 + 규칙 학습). 틀리면 드롭다운으로 다른 계정 선택.
                          <button
                            onClick={() => classify(tx, sug.categoryId)}
                            title={`${sug.reason ? `${sug.reason} — ` : ''}눌러서 이 계정으로 확정해요 (같은 가맹점 전파·규칙 학습)`}
                            className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              sug.confidence >= CONF
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-amber-500/40 bg-amber-500/10 text-amber-600 hover:border-amber-600'
                            }`}
                          >
                            {sug.confidence >= CONF ? '추천' : '⚠️ 확인'} · {catName(sug.categoryId)} 적용
                          </button>
                        )}
                        {ruleSug && busy !== tx.id && (
                          <button
                            onClick={() => classify(tx, ruleSug)}
                            title="학습된 추천 — 눌러서 확정"
                            className="whitespace-nowrap rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                          >
                            학습 · {catName(ruleSug)} 적용
                          </button>
                        )}
                        {misangCat && tx.category_id == null && busy !== tx.id && (
                          // 용도 불명 파킹 — 이 거래만 미상 처리(규칙 학습·전파 없음), '미상 N건'에서 나중에 확인
                          <button
                            onClick={() => classify(tx, misangCat.id, { single: true })}
                            title="용도를 모르는 거래를 일단 보류해요 — 이 거래 한 건만 미상으로(학습 없음), 상단 '미상 N건'에서 나중에 밝혀 재분류"
                            className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            미상
                          </button>
                        )}
                        {tx.split_parent_id == null && busy !== tx.id && (
                          // 공동구매를 브랜드·지점별로 쪼개기 — 비율 학습된 가맹점은 '분할 추천'으로 강조
                          <button
                            onClick={() => openSplit(tx)}
                            title="한 지점 매입으로 잡힌 공동구매를 브랜드·지점별 금액으로 나눠요"
                            className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              splitRuleFor(tx)
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {splitRuleFor(tx) ? '🔀 분할 추천' : '분할'}
                          </button>
                        )}
                      </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                    선택한 월·은행에 거래가 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-border px-3 py-3 text-[13px]">
            <button
              disabled={curPage === 1}
              onClick={() => setPage(curPage - 1)}
              className="rounded-sm px-2.5 py-1 text-muted-foreground transition-colors enabled:hover:text-foreground disabled:opacity-40"
            >
              ← 이전
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => totalPages <= 9 || p === 1 || p === totalPages || Math.abs(p - curPage) <= 2)
              .map((p, i, arr) => (
                <span key={p} className="flex items-center gap-1.5">
                  {i > 0 && arr[i - 1] !== p - 1 && <span className="text-muted-foreground">…</span>}
                  <button
                    onClick={() => setPage(p)}
                    className={`min-w-[30px] rounded-sm px-2 py-1 tabular-nums ${
                      p === curPage ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              disabled={curPage === totalPages}
              onClick={() => setPage(curPage + 1)}
              className="rounded-sm px-2.5 py-1 text-muted-foreground transition-colors enabled:hover:text-foreground disabled:opacity-40"
            >
              다음 →
            </button>
            <span className="ml-2 text-[11px] text-muted-foreground">
              {won(pageStart + 1)}–{won(Math.min(pageStart + PAGE_SIZE, filtered.length))} / {won(filtered.length)}건
            </span>
          </div>
        )}
      </div>

      {splitTarget && (
        <SplitModal
          target={splitTarget}
          suggestion={splitSug}
          onClose={() => setSplitTarget(null)}
          onDone={() => {
            setSplitTarget(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-normal ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 align-middle text-[13px] text-foreground ${right ? 'text-right' : 'text-left'} ${mono ? 'tabular' : ''}`}
    >
      {children}
    </td>
  );
}
