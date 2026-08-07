'use client';

import { useEffect, useState } from 'react';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { AlignmentEvent } from '@/lib/grinder-alignments';
import { kstDate, latestAlignmentDate, latestInspectionDate, ALIGN_REMINDER_MONTHS } from '@/lib/grinder-alignments';

// 그라인더 얼라인먼트 기록 — 지점별 "마지막으로 그라인더를 열어 정렬을 본 날"을 남긴다.
// 이 날짜 이전의 측정은 캘리브레이션 차트에서 현행 데이터와 구분(흐림)된다.
// '정기 점검(이상 없음)'은 3개월 리마인더 주기만 리셋하고 측정 유효성엔 영향이 없다.

const today = () => kstDate();

export default function GrinderAlignmentLog() {
  const [events, setEvents] = useState<AlignmentEvent[]>([]);
  const [store, setStore] = useState<StoreId>('pangyo');
  const [kind, setKind] = useState<'align' | 'check'>('align');
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch('/api/garden-grinder-alignments', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setEvents(Array.isArray(d) ? d : []));
  }, []);

  const save = async () => {
    if (saving || !date) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/garden-grinder-alignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store, date, kind, memo: memo.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? '저장에 실패했습니다.');
      }
      setEvents(await res.json());
      setMemo('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('이 얼라인먼트 기록을 삭제할까요?')) return;
    const res = await fetch(`/api/garden-grinder-alignments?id=${id}`, { method: 'DELETE' });
    if (res.ok) setEvents(await res.json());
  };

  const history = events.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const visible = showAll ? history : history.slice(0, 4);

  const segBtn = (active: boolean): React.CSSProperties => ({
    height: 34,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 13,
    cursor: 'pointer',
    borderRadius: 6,
    border: '1px solid hsl(var(--border))',
    background: active ? 'hsl(var(--foreground))' : 'transparent',
    color: active ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
  });

  return (
    <div className="ta-card bg-background" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span className="text-[15px] font-medium text-foreground">그라인더 얼라인먼트 기록</span>
        <span className="text-[11px] text-muted-foreground">버 정렬·제로포인트를 본 날 — 이 날짜 이전 측정은 차트에서 흐리게 구분됩니다</span>
      </div>

      {/* 지점별 마지막 얼라인 날짜 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        {STORES.map((s) => {
          const last = latestAlignmentDate(events, s.id);
          const checked = latestInspectionDate(events, s.id);
          return (
            <div key={s.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '10px 14px' }}>
              <div className="text-[11px] text-muted-foreground">{s.label} 마지막 얼라인먼트</div>
              <div className="tabular text-[15px] text-foreground" style={{ marginTop: 2 }}>
                {last ?? '기록 없음'}
                {last === today() && <span className="text-[11px] text-muted-foreground"> (오늘)</span>}
              </div>
              {checked && checked !== last && (
                <div className="text-[11px] text-muted-foreground" style={{ marginTop: 2 }}>점검 {checked} 이상 없음</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 기록 추가 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {STORES.map((s) => (
            <button key={s.id} onClick={() => setStore(s.id)} style={segBtn(store === s.id)}>
              {s.short}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setKind('align')} style={segBtn(kind === 'align')} title="버 정렬·제로포인트 등 물리적 조정">
            재정렬
          </button>
          <button
            onClick={() => setKind('check')}
            style={segBtn(kind === 'check')}
            title={`정기 점검 결과 이상 없음 — ${ALIGN_REMINDER_MONTHS}개월 리마인더만 리셋됩니다`}
          >
            점검 · 이상 없음
          </button>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ta-input" style={{ width: 150 }} />
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={kind === 'check' ? '메모 (예: 분쇄 상태 정상, 특이사항 없음)' : '메모 (예: 버 틀어짐 발견, 재정렬 완료)'}
          className="ta-input"
          style={{ flex: 1, minWidth: 220 }}
        />
        <button onClick={save} disabled={saving} className="ta-btn-primary" style={{ height: 34, paddingLeft: 14, paddingRight: 14, fontSize: 13, opacity: saving ? 0.5 : 1 }}>
          {saving ? '저장 중…' : kind === 'check' ? '점검 기록' : '얼라인 기록'}
        </button>
      </div>
      {error && <p className="text-[13px]" style={{ margin: 0, color: 'hsl(0 72% 45%)' }}>{error}</p>}

      {/* 이력 */}
      {history.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visible.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="tabular text-[13px] text-foreground" style={{ minWidth: 90 }}>{e.date}</span>
              <span className="text-[13px] text-muted-foreground" style={{ minWidth: 56 }}>
                {STORES.find((s) => s.id === e.store)?.label ?? e.store}
              </span>
              {e.kind === 'check' && (
                <span className="text-[11px] text-muted-foreground" style={{ border: '1px solid hsl(var(--border))', borderRadius: 4, padding: '1px 6px' }}>
                  점검
                </span>
              )}
              {e.memo && <span className="text-[13px] text-muted-foreground" style={{ flex: 1 }}>{e.memo}</span>}
              <button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }} title="기록 삭제">
                ×
              </button>
            </div>
          ))}
          {history.length > 4 && (
            <button onClick={() => setShowAll((v) => !v)} className="text-[11px] text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start', padding: 0 }}>
              {showAll ? '접기' : `이력 전체 보기 (${history.length}건)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
