'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface TxRow {
  id: number;
  memo: string;
  normalized_key: string;
  amount_in: number;
  amount_out: number;
  category_id: number | null;
  tx_at: string;
  bank: string;
  source?: string;
  is_installment?: boolean;
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

const won = (n: number) => n.toLocaleString('ko-KR');
const CONF = 0.6;
// Gemini 무료 티어 한도 이슈로 AI 추천 잠시 끔. API에 billing 연결하면 true 로 되살림.
const AI_ENABLED = false;
const TYPE_LABEL: Record<string, string> = {
  revenue: '매출',
  cogs: '재료비(원가)',
  sga: '판매관리비',
  non_operating: '영업외',
  excluded: '손익 제외',
};
const TYPE_ORDER = ['revenue', 'cogs', 'sga', 'non_operating', 'excluded'];
const BANK_LABEL: Record<string, string> = { shinhan: '신한', woori: '우리' };
const fmtYmLabel = (ym: string) => {
  const [y, mo] = ym.split('-');
  return `${y}년 ${Number(mo)}월`;
};

export default function ClassifyPanel({
  txns,
  cats,
  userId,
  confirmedYms = [],
  rules = [],
  initialFilter,
}: {
  txns: TxRow[];
  cats: Cat[];
  userId: string;
  confirmedYms?: string[];
  rules?: { normalized_key: string; category_id: number }[];
  initialFilter?: { ym?: string; type?: string; cat?: string; unclassified?: boolean; source?: string };
}) {
  const ruleMap = new Map(rules.map((r) => [r.normalized_key, r.category_id]));
  const confirmedSet = new Set(confirmedYms);
  const isLocked = (tx: TxRow) => confirmedSet.has(tx.tx_at.slice(0, 7));
  const sortTxns = (arr: TxRow[]) =>
    [...arr].sort((a, b) => {
      const au = a.category_id == null ? 0 : 1;
      const bu = b.category_id == null ? 0 : 1;
      if (au !== bu) return au - bu;
      return b.tx_at.localeCompare(a.tx_at);
    });
  const [rows, setRows] = useState<TxRow[]>(() => sortTxns(txns));
  // 사이드바에서 자료 업로드 후 router.refresh() 되면 새 거래를 반영
  useEffect(() => {
    setRows(sortTxns(txns));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [filterYm, setFilterYm] = useState(initialFilter?.ym ?? 'all');
  const [filterBank, setFilterBank] = useState('all');
  // 자금 흐름에서 넘어온 계정 필터(type/세부계정)
  const [catFilter, setCatFilter] = useState<{ type?: string; cat?: string }>({
    type: initialFilter?.type,
    cat: initialFilter?.cat,
  });
  const [srcFilter, setSrcFilter] = useState<string>(initialFilter?.source ?? 'all'); // all | bank | card
  const [unclOnly, setUnclOnly] = useState(!!initialFilter?.unclassified); // 미분류만 보기
  const [search, setSearch] = useState(''); // 가맹점/내용 검색
  const [selected, setSelected] = useState<Set<number>>(new Set()); // 다중 선택
  const [bulkCat, setBulkCat] = useState<number | ''>(''); // 일괄 분류 카테고리

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
  const filtered = rows.filter(
    (r) =>
      (filterYm === 'all' || r.tx_at.slice(0, 7) === filterYm) &&
      (filterBank === 'all' || r.bank === filterBank) &&
      (srcFilter === 'all' || (r.source ?? 'bank') === srcFilter) &&
      (!unclOnly || r.category_id == null) &&
      (!q || r.memo.toLowerCase().includes(q) || r.normalized_key.toLowerCase().includes(q)) &&
      matchesCat(r)
  );
  const classifiedCount = filtered.filter((r) => r.category_id != null).length;
  const progress = filtered.length ? Math.round((classifiedCount / filtered.length) * 100) : 0;

  // 다중 선택(현재 필터·미확정 대상)
  const selectableIds = filtered.filter((r) => !isLocked(r)).map((r) => r.id);
  const selCount = selectableIds.filter((id) => selected.has(id)).length;
  const allSelected = selectableIds.length > 0 && selCount === selectableIds.length;
  const toggleSel = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));

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
    setRows((list) => list.map((r) => (selected.has(r.id) && !isLocked(r) ? { ...r, category_id: catId } : r)));
    setSelected(new Set());
    setBulkCat('');
    setAiApplying(false);
  }

  async function classify(tx: TxRow, categoryId: number) {
    setBusy(tx.id);
    setError(null);
    const supabase = createClient();
    const now = new Date().toISOString();
    const key = tx.normalized_key;

    let q = supabase
      .schema('finance')
      .from('transactions')
      .update({ category_id: categoryId, classified_by: userId, classified_at: now });
    q = key ? q.eq('normalized_key', key) : q.eq('id', tx.id);
    // 확정된 달의 거래는 건드리지 않음(키 기반 분류가 여러 달에 걸칠 수 있음)
    if (confirmedYms.length) q = q.not('ym', 'in', `(${confirmedYms.join(',')})`);
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
        .upsert({ normalized_key: key, category_id: categoryId, created_by: userId }, { onConflict: 'normalized_key' });
    }
    setRows((list) =>
      list.map((r) =>
        (key ? r.normalized_key === key : r.id === tx.id) && !isLocked(r) ? { ...r, category_id: categoryId } : r
      )
    );
    setBusy(null);
    return true;
  }

  async function fetchAI() {
    setAiLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/ai-classify', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'AI 추천에 실패했어요.');
      const map: Record<string, Suggestion> = {};
      for (const s of j.suggestions as { key: string; categoryId: number; confidence: number; reason: string }[]) {
        map[s.key] = { categoryId: s.categoryId, confidence: s.confidence, reason: s.reason };
      }
      setSuggestions(map);
      if (Object.keys(map).length === 0) setError('AI가 추천할 미분류 그룹이 없어요.');
    } catch (e) {
      setError((e as Error).message);
    }
    setAiLoading(false);
  }

  async function applyConfident() {
    setAiApplying(true);
    const seen = new Set<string>();
    for (const tx of rows) {
      if (tx.category_id != null || !tx.normalized_key) continue;
      const s = suggestions[tx.normalized_key];
      if (!s || s.confidence < CONF || seen.has(tx.normalized_key)) continue;
      seen.add(tx.normalized_key);
      await classify(tx, s.categoryId);
    }
    setAiApplying(false);
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
    // 확정된 달은 초기화에서 제외
    if (confirmedYms.length) uq = uq.not('ym', 'in', `(${confirmedYms.join(',')})`);
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
    if (r.category_id == null && r.normalized_key && !suggestions[r.normalized_key] && !isLocked(r) && ruleMap.has(r.normalized_key))
      ruleKeys.add(r.normalized_key);
  }
  async function applyRules() {
    setAiApplying(true);
    const seen = new Set<string>();
    for (const tx of rows) {
      if (tx.category_id != null || !tx.normalized_key || isLocked(tx) || seen.has(tx.normalized_key)) continue;
      const cat = ruleMap.get(tx.normalized_key);
      if (!cat) continue;
      seen.add(tx.normalized_key);
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
    <div className="flex flex-col gap-3">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-[10px]">
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
        <div className="inline-flex gap-1 rounded-md border border-border p-1">
          {['all', ...banks].map((b) => {
            const on = filterBank === b;
            return (
              <button
                key={b}
                onClick={() => setFilterBank(b)}
                className={`rounded-sm px-3 py-1 text-[13px] ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {b === 'all' ? '전체 은행' : `${BANK_LABEL[b] ?? b}은행`}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setUnclOnly((v) => !v)}
          className={`rounded-md border px-3 py-[7px] text-[13px] font-semibold ${
            unclOnly ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          미분류만
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="가맹점·내용 검색"
          className="ta-input min-w-[160px] flex-1 text-[13px]"
        />
        {catFilterActive && (
          <button
            onClick={() => setCatFilter({})}
            title="필터 해제"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1 text-[13px] font-semibold text-primary"
          >
            {catFilterLabel}만 보기
            <span className="text-[15px] leading-none">×</span>
          </button>
        )}
        {srcFilter !== 'all' && (
          <button
            onClick={() => setSrcFilter('all')}
            title="필터 해제"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1 text-[13px] font-semibold text-primary"
          >
            {srcFilter === 'card' ? '💳 카드만 보기' : '🏦 은행만 보기'}
            <span className="text-[15px] leading-none">×</span>
          </button>
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
          <span className="text-[13px] font-semibold text-foreground">{selCount}건 선택됨</span>
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
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <th className="w-[36px] px-3 py-2 text-left">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} title="전체 선택" aria-label="전체 선택" />
                </th>
                <Th>은행</Th>
                <Th>거래일자</Th>
                <Th>거래시간</Th>
                <Th right>금액</Th>
                <Th>내용</Th>
                <Th>카테고리</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => {
                const locked = isLocked(tx);
                const pending = tx.category_id == null;
                const sug = pending && tx.normalized_key ? suggestions[tx.normalized_key] : undefined;
                // 학습된 규칙 추천(미분류 + AI추천 없을 때) — 미리 선택돼 보이지만 확정은 사람이
                const ruleSug = pending && !sug && tx.normalized_key ? ruleMap.get(tx.normalized_key) : undefined;
                const isInflow = tx.amount_in >= tx.amount_out;
                const allowed = isInflow
                  ? ['revenue', 'non_operating', 'excluded']
                  : ['cogs', 'sga', 'non_operating', 'excluded'];
                const [date, time] = tx.tx_at.split('T');
                const selVal = tx.category_id ?? sug?.categoryId ?? ruleSug ?? '';
                return (
                  <tr key={tx.id} className={`border-t border-border hover:bg-accent ${selected.has(tx.id) ? 'bg-primary/5' : locked ? 'bg-muted' : ''}`}>
                    <td className="px-3 py-2 align-middle">
                      {!locked && (
                        <input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSel(tx.id)} aria-label="선택" />
                      )}
                    </td>
                    <Td>{BANK_LABEL[tx.bank] ?? tx.bank}</Td>
                    <Td mono>{date}</Td>
                    <Td mono>{time ?? ''}</Td>
                    <Td right mono>
                      {tx.amount_in > 0
                        ? <span className="text-positive">+{won(tx.amount_in)}</span>
                        : `-${won(tx.amount_out)}`}
                    </Td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex max-w-[380px] items-center gap-1.5">
                        {tx.source === 'card' && <span title="신한카드 이용내역" className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">💳</span>}
                        <span className="line-clamp-2 min-w-0 break-all" title={tx.memo}>
                          {tx.memo || <span className="text-muted-foreground">(빈 내용)</span>}
                        </span>
                        {tx.is_installment && <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">할부</span>}
                      </div>
                    </td>
                    <Td>
                      {locked ? (
                        <span className="inline-flex items-center gap-[6px] text-foreground">
                          🔒 {tx.category_id ? catName(tx.category_id) : '미분류'}
                          <span className="text-[11px] text-muted-foreground">확정됨</span>
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
                          <span title={sug.reason} className={`whitespace-nowrap text-[11px] ${sug.confidence >= CONF ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {sug.confidence >= CONF ? '추천' : '⚠️ 확인'} · {catName(sug.categoryId)}
                          </span>
                        )}
                        {ruleSug && busy !== tx.id && (
                          <button
                            onClick={() => classify(tx, ruleSug)}
                            title="학습된 추천 — 눌러서 확정"
                            className="whitespace-nowrap rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                          >
                            학습 · {catName(ruleSug)} 적용
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
                  <td colSpan={7} className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                    선택한 월·은행에 거래가 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
