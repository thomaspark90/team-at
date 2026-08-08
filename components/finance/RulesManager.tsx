'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// 학습된 분류 규칙(가맹점 키 → 계정) 관리 — 설정 화면의 미니 섹션.
// 규칙이 잘못 학습되면(2026-08-08 '쿠팡→재료비' 사고) SQL 없이 여기서 바로 지운다.
// 규칙은 분류 화면에서 계정을 고를 때 자동 학습되므로 여기선 조회·삭제만 제공한다.

interface RuleRow {
  normalized_key: string;
  brand: string;
  category_id: number;
}

const BRAND_LABEL: Record<string, string> = { staffmeal: '스탭밀', garden: '가든' };

export default function RulesManager({ catNames }: { catNames: Record<number, string> }) {
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // `${brand}|${key}`

  const load = async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase
      .schema('finance')
      .from('rules')
      .select('normalized_key,brand,category_id')
      .order('normalized_key');
    if (e) setError(e.message);
    else setRules((data ?? []) as RuleRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!rules) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) => r.normalized_key.includes(q) || (catNames[r.category_id] ?? '').toLowerCase().includes(q),
    );
  }, [rules, search, catNames]);

  async function remove(rule: RuleRow) {
    if (!window.confirm(`'${rule.normalized_key}' → ${catNames[rule.category_id] ?? rule.category_id} 규칙을 삭제할까요?\n이미 분류된 거래는 그대로 두고, 앞으로의 자동 분류만 멈춥니다.`)) return;
    const id = `${rule.brand}|${rule.normalized_key}`;
    setBusy(id);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase
      .schema('finance')
      .from('rules')
      .delete()
      .eq('normalized_key', rule.normalized_key)
      .eq('brand', rule.brand);
    if (e) setError(e.message);
    else setRules((list) => (list ?? []).filter((r) => !(r.normalized_key === rule.normalized_key && r.brand === rule.brand)));
    setBusy(null);
  }

  if (error) return <p className="text-[13px] text-destructive">⚠️ {error}</p>;
  if (!rules) return <p className="text-[13px] text-muted-foreground">불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="가맹점·계정 검색"
          className="ta-input w-[240px]"
        />
        <span className="text-[11px] text-muted-foreground">
          {rules.length}개 규칙 — 분류 화면에서 계정을 고르면 자동 학습돼요. 삭제해도 이미 분류된 거래는 안 바뀝니다.
        </span>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              <th className="px-3 py-2 text-left font-normal">가맹점 키</th>
              <th className="px-3 py-2 text-left font-normal">브랜드</th>
              <th className="px-3 py-2 text-left font-normal">계정</th>
              <th className="px-3 py-2 text-right font-normal">삭제</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr className="border-t border-border">
                <td colSpan={4} className="px-3 py-3 text-muted-foreground">
                  {search ? '검색 결과가 없어요.' : '학습된 규칙이 아직 없어요.'}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={`${r.brand}|${r.normalized_key}`} className="border-t border-border">
                <td className="max-w-[320px] truncate px-3 py-2 text-foreground">{r.normalized_key}</td>
                <td className="px-3 py-2 text-muted-foreground">{BRAND_LABEL[r.brand] ?? r.brand}</td>
                <td className="px-3 py-2 text-muted-foreground">{catNames[r.category_id] ?? `#${r.category_id}`}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => remove(r)}
                    disabled={busy === `${r.brand}|${r.normalized_key}`}
                    className="ta-btn h-7 px-2 text-[13px]"
                  >
                    {busy === `${r.brand}|${r.normalized_key}` ? '삭제 중…' : '삭제'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
