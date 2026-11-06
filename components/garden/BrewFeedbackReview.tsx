'use client';

import { honorific } from '@/lib/staff/names';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BrewFeedback, BrewType, StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import { chipLabel, filterFeedback, groupFeedback, meshDeltaText, summarize } from '@/lib/garden/brew-feedback';
import { fmtDate } from '@/lib/garden/format';
import SegmentControl from '@/components/nav/SegmentControl';

// 추출 평가 모아보기 — 태블릿 레시피 보드에서 남긴 의견을 지점·타입·기간·원두·스탭으로 걸러 본다. 읽기 전용(레시피는 바꾸지 않는다).
// 묶음 = 원두·지점·ICE/HOT, 그 안을 레시피 버전별로 집계 — 버전이 다르면 기준 분쇄도가 달라 섞어 평균 내지 않는다.

const PERIODS = [
  { id: 'all', label: '전체', days: null },
  { id: '7', label: '최근 7일', days: 7 },
  { id: '30', label: '최근 30일', days: 30 },
];

function MeshChange({ f }: { f: BrewFeedback }) {
  const delta = meshDeltaText(f.baseMesh, f.nextMesh);
  if (!delta) return null;
  return (
    <>
      {' · '}
      {f.baseMesh!.toFixed(1)} → {f.nextMesh!.toFixed(1)} ({delta})
    </>
  );
}

export default function BrewFeedbackReview() {
  const [list, setList] = useState<BrewFeedback[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [store, setStore] = useState<StoreId | ''>('');
  const [brewType, setBrewType] = useState<BrewType | ''>('');
  const [period, setPeriod] = useState('all');
  const [beanKey, setBeanKey] = useState('');
  const [staff, setStaff] = useState('');

  useEffect(() => {
    fetch('/api/garden-brew-feedback', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setList)
      .catch(() => setFailed(true));
  }, []);

  // 원두·스탭 선택지 — 평가가 남아 있는 것만. 같은 원두는 가장 최근 표기로 한 번만
  const beans = useMemo(() => {
    const m = new Map<string, { bean: string; at: string }>();
    for (const f of list ?? []) {
      const cur = m.get(f.beanKey);
      if (!cur || f.createdAt.localeCompare(cur.at) > 0) m.set(f.beanKey, { bean: f.bean, at: f.createdAt });
    }
    return Array.from(m.entries())
      .map(([key, v]) => ({ key, bean: v.bean }))
      .sort((a, b) => a.bean.localeCompare(b.bean, 'ko'));
  }, [list]);
  const staffNames = useMemo(() => Array.from(new Set((list ?? []).map((f) => f.staffName))).sort((a, b) => a.localeCompare(b, 'ko')), [list]);

  const filtered = useMemo(
    () => filterFeedback(list ?? [], { store, brewType, beanKey, staff, days: PERIODS.find((p) => p.id === period)?.days ?? null }),
    [list, store, brewType, beanKey, staff, period]
  );
  const groups = useMemo(() => groupFeedback(filtered), [filtered]);

  return (
    <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="text-title font-medium" style={{ margin: 0 }}>추출 평가 모아보기</h1>
        <Link href="/garden/recipes" className="text-body text-muted-foreground underline hover:text-foreground">
          ← 필터 레시피
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SegmentControl
          ariaLabel="지점"
          items={[{ id: '', label: '전 지점' }, ...[...STORES].reverse().map((s) => ({ id: s.id, label: s.short }))]}
          value={store}
          onSelect={(id) => setStore(id as StoreId | '')}
        />
        <SegmentControl
          ariaLabel="HOT/ICE"
          items={[{ id: '', label: 'HOT·ICE' }, { id: 'hot', label: 'HOT' }, { id: 'ice', label: 'ICE' }]}
          value={brewType}
          onSelect={(id) => setBrewType(id as BrewType | '')}
        />
        <SegmentControl ariaLabel="기간" items={PERIODS.map((p) => ({ id: p.id, label: p.label }))} value={period} onSelect={setPeriod} />
        <select aria-label="원두" value={beanKey} onChange={(e) => setBeanKey(e.target.value)} className="ta-input" style={{ width: 'auto', maxWidth: 280, cursor: 'pointer' }}>
          <option value="">전체 원두</option>
          {beans.map((b) => (
            <option key={b.key} value={b.key}>{b.bean}</option>
          ))}
        </select>
        <select aria-label="스탭" value={staff} onChange={(e) => setStaff(e.target.value)} className="ta-input" style={{ width: 'auto', cursor: 'pointer' }}>
          <option value="">전체 스탭</option>
          {staffNames.map((n) => (
            <option key={n} value={n}>{honorific(n)}</option>
          ))}
        </select>
        {list && <span className="tabular text-caption text-muted-foreground">{filtered.length}건</span>}
      </div>

      {failed && <p className="text-body text-muted-foreground">추출 평가를 불러오지 못했어요. 새로고침해 주세요.</p>}
      {!failed && !list && <p className="text-body text-muted-foreground">불러오는 중…</p>}
      {list && groups.length === 0 && (
        <p className="text-body text-muted-foreground">
          {list.length === 0 ? '아직 남겨진 추출 평가가 없어요.' : '조건에 맞는 추출 평가가 없어요.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {groups.map((g) => (
          <section key={g.key} className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="border-b border-border" style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
              <span className="text-body font-medium">{g.bean}</span>
              <span className="text-caption text-muted-foreground">
                {g.brewType.toUpperCase()} · {STORES.find((s) => s.id === g.store)?.short ?? g.store}
              </span>
              <span style={{ flex: 1 }} />
              <span className="tabular text-caption text-muted-foreground">{g.count}건</span>
            </div>

            {g.versions.map((v) => {
              const sum = summarize(v.items);
              return (
                <div key={v.recipeVersion} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <p className="tabular text-caption text-muted-foreground" style={{ margin: 0 }}>
                    레시피 {fmtDate(v.recipeVersion)} 버전 · {sum.count}건
                    {sum.avgMesh != null && ` · 제안 평균 ${sum.avgMesh.toFixed(2)}`}
                    {sum.deltas.length > 0 && ` · ${sum.deltas.map(([t, n]) => `${t} ${n}`).join(' · ')}`}
                  </p>
                  {sum.chips.length > 0 && (
                    <p className="tabular text-caption" style={{ margin: 0 }}>
                      {sum.chips.map(([id, n]) => `${chipLabel(id)} ${n}`).join(' · ')}
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
                    {v.items.map((f) => (
                      <div key={f.id} className="border-b border-border last:border-b-0" style={{ padding: '8px 0' }}>
                        <p className="tabular text-caption text-muted-foreground" style={{ margin: 0 }}>
                          {honorific(f.staffName)} · {fmtDate(f.createdAt)}
                          <MeshChange f={f} />
                        </p>
                        {f.issues.length > 0 && (
                          <p className="text-body" style={{ margin: '2px 0 0' }}>{f.issues.map(chipLabel).join(' · ')}</p>
                        )}
                        {f.memo && (
                          <p className="text-body text-muted-foreground" style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{f.memo}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
