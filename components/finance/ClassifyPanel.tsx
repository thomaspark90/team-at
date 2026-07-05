'use client';

import { useState } from 'react';
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
  initialFilter,
}: {
  txns: TxRow[];
  cats: Cat[];
  userId: string;
  confirmedYms?: string[];
  initialFilter?: { ym?: string; type?: string; cat?: string; unclassified?: boolean; source?: string };
}) {
  const confirmedSet = new Set(confirmedYms);
  const isLocked = (tx: TxRow) => confirmedSet.has(tx.tx_at.slice(0, 7));
  const [rows, setRows] = useState<TxRow[]>(() =>
    [...txns].sort((a, b) => {
      const au = a.category_id == null ? 0 : 1;
      const bu = b.category_id == null ? 0 : 1;
      if (au !== bu) return au - bu;
      return b.tx_at.localeCompare(a.tx_at);
    })
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [filterYm, setFilterYm] = useState(initialFilter?.ym ?? 'all');
  const [filterBank, setFilterBank] = useState('all');
  // 자금 흐름에서 넘어온 계정 필터(type/세부계정) 또는 미분류만 보기
  const [catFilter, setCatFilter] = useState<{ type?: string; cat?: string; unclassified: boolean }>({
    type: initialFilter?.type,
    cat: initialFilter?.cat,
    unclassified: !!initialFilter?.unclassified,
  });
  const [srcFilter, setSrcFilter] = useState<string>(initialFilter?.source ?? 'all'); // all | bank | card

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
    if (catFilter.unclassified) return r.category_id == null;
    if (catFilter.type) {
      const c = r.category_id != null ? catById.get(r.category_id) : undefined;
      if (!c || c.type !== catFilter.type) return false;
      // cat 은 중분류(대분류명·leafNameOf) 또는 소분류(자기 이름) 둘 다 매칭
      if (catFilter.cat) return leafNameOf(c) === catFilter.cat || c.name === catFilter.cat;
      return true;
    }
    return true;
  };
  const catFilterActive = catFilter.unclassified || !!catFilter.type;
  const catFilterLabel = catFilter.unclassified
    ? '미분류'
    : catFilter.cat
    ? catFilter.cat
    : TYPE_LABEL[catFilter.type ?? ''] ?? catFilter.type ?? '';

  const filtered = rows.filter(
    (r) =>
      (filterYm === 'all' || r.tx_at.slice(0, 7) === filterYm) &&
      (filterBank === 'all' || r.bank === filterBank) &&
      (srcFilter === 'all' || (r.source ?? 'bank') === srcFilter) &&
      matchesCat(r)
  );

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
    if (!window.confirm('모든 거래의 분류와 학습 규칙을 초기화할까요? 되돌릴 수 없어요.')) return;
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

  if (rows.length === 0) {
    return (
      <div className="mx-auto my-[60px] max-w-[460px] text-center text-muted-foreground">
        <div className="mb-3 text-[32px]">📭</div>
        <h2 className="mb-2 text-[18px] text-foreground">저장된 거래가 없어요</h2>
        <p className="text-[14px]">먼저 업로드 화면에서 거래내역을 저장해주세요.</p>
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
        {catFilterActive && (
          <button
            onClick={() => setCatFilter({ unclassified: false })}
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
        <p className="flex-1 text-[14px] text-muted-foreground">
          {filterYm === 'all' && filterBank === 'all' ? '전체' : '선택 범위'} <b className="text-foreground">{won(filtered.length)}건</b> · 미분류{' '}
          <b className="text-foreground">{won(unclassified)}건</b>
        </p>
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
        <button onClick={resetAll} disabled={aiApplying} className="ta-btn text-[13px] text-destructive">
          전체 초기화
        </button>
      </div>
      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
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
                const isInflow = tx.amount_in >= tx.amount_out;
                const allowed = isInflow
                  ? ['revenue', 'non_operating', 'excluded']
                  : ['cogs', 'sga', 'non_operating', 'excluded'];
                const [date, time] = tx.tx_at.split('T');
                const selVal = tx.category_id ?? sug?.categoryId ?? '';
                return (
                  <tr key={tx.id} className={`border-t border-border hover:bg-accent ${locked ? 'bg-muted' : ''}`}>
                    <Td>{BANK_LABEL[tx.bank] ?? tx.bank}</Td>
                    <Td mono>{date}</Td>
                    <Td mono>{time ?? ''}</Td>
                    <Td right mono>
                      {tx.amount_in > 0
                        ? <span className="text-positive">+{won(tx.amount_in)}</span>
                        : `-${won(tx.amount_out)}`}
                    </Td>
                    <Td>
                      {tx.source === 'card' && <span title="신한카드 이용내역" className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">💳</span>}
                      {tx.memo || <span className="text-muted-foreground">(빈 내용)</span>}
                      {tx.is_installment && <span className="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">할부</span>}
                    </Td>
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
                      </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[13px] text-muted-foreground">
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
