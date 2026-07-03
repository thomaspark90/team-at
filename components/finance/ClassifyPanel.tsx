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
}
export interface Cat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
}
interface Suggestion {
  categoryId: number;
  confidence: number;
  reason: string;
}

const won = (n: number) => n.toLocaleString('ko-KR');
const REV = '#12805c';
const EXP = '#b23b3b';
const ACCENT = '#0099FF';
const CONF = 0.6; // 이 이상이면 "확신"
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

export default function ClassifyPanel({ txns, cats, userId }: { txns: TxRow[]; cats: Cat[]; userId: string }) {
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

  const catLabel = (c: Cat) => {
    const p = cats.find((x) => x.id === c.parent_id);
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const catName = (id: number) => {
    const c = cats.find((x) => x.id === id);
    return c ? catLabel(c) : `#${id}`;
  };

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
      list.map((r) => ((key ? r.normalized_key === key : r.id === tx.id) ? { ...r, category_id: categoryId } : r))
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
    const { error: e1 } = await supabase
      .schema('finance')
      .from('transactions')
      .update({ category_id: null, classified_by: null, classified_at: null })
      .gte('id', 0);
    if (e1) {
      setError(e1.message);
      setAiApplying(false);
      return;
    }
    await supabase.schema('finance').from('rules').delete().gte('id', 0);
    setRows((rs) => rs.map((r) => ({ ...r, category_id: null })));
    setSuggestions({});
    setAiApplying(false);
  }

  const unclassified = rows.filter((r) => r.category_id == null).length;
  const hasSug = Object.keys(suggestions).length > 0;
  const confidentKeys = new Set<string>();
  for (const r of rows) {
    if (r.category_id == null && r.normalized_key && suggestions[r.normalized_key]?.confidence >= CONF)
      confidentKeys.add(r.normalized_key);
  }

  if (rows.length === 0) {
    return (
      <div style={{ margin: '60px auto', maxWidth: 460, textAlign: 'center', color: '#777' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>저장된 거래가 없어요</h2>
        <p style={{ fontSize: 14, margin: 0 }}>먼저 업로드 화면에서 거래내역을 저장해주세요.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 14, color: '#888', margin: 0, flex: 1 }}>
          전체 <b>{won(rows.length)}건</b> · 미분류 <b style={{ color: unclassified ? EXP : REV }}>{won(unclassified)}건</b>.
        </p>
        {AI_ENABLED && (
          <button
            onClick={fetchAI}
            disabled={aiLoading || unclassified === 0}
            style={btn(aiLoading || unclassified === 0 ? '#CCC' : '#000')}
          >
            {aiLoading ? 'AI 분석 중…' : 'AI 추천 분류'}
          </button>
        )}
        {AI_ENABLED && hasSug && confidentKeys.size > 0 && (
          <button onClick={applyConfident} disabled={aiApplying} style={btn(aiApplying ? '#CCC' : ACCENT)}>
            {aiApplying ? '적용 중…' : `확신 항목 저장 (${confidentKeys.size}그룹)`}
          </button>
        )}
        <button onClick={resetAll} disabled={aiApplying} style={btn(aiApplying ? '#CCC' : '#b23b3b')}>
          전체 초기화
        </button>
      </div>
      {error && <div style={{ color: EXP, fontSize: 13 }}>⚠️ {error}</div>}
      {hasSug && (
        <p style={{ fontSize: 12, color: '#999', margin: 0 }}>
          🤖 = AI 추천(미리 선택됨, 저장 전) · ⚠️ = 신뢰도 낮음, 직접 확인 필요. 드롭다운에서 바꾸면 그 즉시 저장돼요.
        </p>
      )}

      <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 860 }}>
            <thead>
              <tr style={{ background: '#F7F9FB', color: '#888' }}>
                <Th>거래일자</Th>
                <Th>거래시간</Th>
                <Th right>금액</Th>
                <Th>내용</Th>
                <Th>카테고리</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => {
                const pending = tx.category_id == null;
                const sug = pending && tx.normalized_key ? suggestions[tx.normalized_key] : undefined;
                const isInflow = tx.amount_in >= tx.amount_out;
                const allowed = isInflow
                  ? ['revenue', 'non_operating', 'excluded']
                  : ['cogs', 'sga', 'non_operating', 'excluded'];
                const [date, time] = tx.tx_at.split('T');
                const selVal = tx.category_id ?? sug?.categoryId ?? '';
                return (
                  <tr key={tx.id} style={{ borderTop: '1px solid #EEE', background: pending ? '#FFFBEB' : '#fff' }}>
                    <Td mono>{date}</Td>
                    <Td mono>{time ?? ''}</Td>
                    <Td right mono>
                      {tx.amount_in > 0 ? (
                        <span style={{ color: REV }}>+{won(tx.amount_in)}</span>
                      ) : (
                        <span style={{ color: EXP }}>-{won(tx.amount_out)}</span>
                      )}
                    </Td>
                    <Td>{tx.memo || <span style={{ color: '#bbb' }}>(빈 내용)</span>}</Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          value={selVal}
                          disabled={busy === tx.id}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (v) classify(tx, v);
                          }}
                          style={{
                            fontSize: 13,
                            padding: '6px 10px',
                            borderRadius: 7,
                            border: `1px solid ${pending ? ACCENT : '#DDD'}`,
                            fontFamily: 'inherit',
                            background: '#fff',
                            minWidth: 190,
                            color: pending ? '#111' : '#333',
                          }}
                        >
                          <option value="">미분류 — 선택…</option>
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
                        {busy === tx.id && <span style={{ fontSize: 11, color: '#999' }}>저장…</span>}
                        {sug && busy !== tx.id && (
                          <span
                            title={sug.reason}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              color: sug.confidence >= CONF ? ACCENT : '#B08900',
                            }}
                          >
                            {sug.confidence >= CONF ? '🤖 추천' : '⚠️ 확인'} · {catName(sug.categoryId)}
                          </span>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    padding: '9px 18px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
    cursor: bg === '#CCC' ? 'default' : 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };
}
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{ textAlign: right ? 'right' : 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
}
function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '10px 14px',
        color: '#333',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
        fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}
