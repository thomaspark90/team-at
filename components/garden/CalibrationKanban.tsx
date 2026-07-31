'use client';

import { useEffect, useMemo, useState } from 'react';
import { STORES } from '@/lib/types';
import type { CalibrationCheck, CheckStatus } from '@/lib/calibration-checks';
import { CHECK_COLUMNS, periodOf } from '@/lib/calibration-checks';
import { toast } from '@/components/Toast';

// 그라인더 드리프트 체크 칸반 — 월 2회(전반/후반) 지점별 카드가 자동 생성되고
// 할 일 → 진행 중 → 완료로 옮기며 관리한다. 완료 시 측정 메모를 남긴다.

const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.label ?? id;

export default function CalibrationKanban() {
  const [checks, setChecks] = useState<CalibrationCheck[]>([]);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/garden-calibration-checks', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setChecks(Array.isArray(d) ? d : []))
      .catch(() => toast('체크 목록을 불러오지 못했어요. 새로고침해 주세요.', 'error'));
  }, []);

  const currentKey = periodOf(new Date()).key;
  const current = useMemo(() => checks.filter((c) => c.period === currentKey), [checks, currentKey]);
  const past = useMemo(
    () =>
      checks
        .filter((c) => c.period !== currentKey)
        .sort((a, b) => b.period.localeCompare(a.period))
        .slice(0, 4),
    [checks, currentKey]
  );

  const move = async (check: CalibrationCheck, status: CheckStatus) => {
    if (busy) return;
    setBusy(check.id);
    // 완료로 옮길 때 측정 메모(선택) 입력
    let memo: string | undefined;
    if (status === 'done') {
      memo = window.prompt('측정 메모 (선택) — 예: 6.5 → 918µm, 기준선 유지', check.memo ?? '') ?? undefined;
    }
    const res = await fetch('/api/garden-calibration-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: check.id, status, ...(memo !== undefined ? { memo } : {}) }),
    }).catch(() => null);
    if (res?.ok) setChecks(await res.json());
    else toast('카드 이동에 실패했어요. 다시 시도해 주세요.', 'error');
    setBusy(null);
  };

  return (
    <div className="min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-3 block text-[13px] text-muted-foreground hover:text-foreground"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: open ? undefined : 0 }}
      >
        그라인더 드리프트 체크 (월 2회 · 전반/후반) {open ? '▴' : '▾'}
      </button>

      {open && (
        <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
            버 마모로 캘리브레이션이 틀어지지 않는지 반월마다 확인합니다 — 기준 원두를{' '}
            <strong>다이얼 6.5, 1~2샷</strong> 컴퍼스로 측정해{' '}
            <a href="/garden/calibration" className="underline hover:text-foreground">분쇄도 측정</a>에 올린 뒤
            카드를 완료로 옮겨주세요. (양재천 기준선 915µm, 판교 729µm — 2026-07-16)
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {CHECK_COLUMNS.map((col) => {
              const cards = current.filter((c) => c.status === col.status);
              return (
                <div
                  key={col.status}
                  className="rounded-md border border-border"
                  style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 96 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="text-[12px] font-medium text-foreground">{col.label}</span>
                    <span className="tabular text-[11px] text-muted-foreground">{cards.length}</span>
                  </div>
                  {cards.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">{col.status === 'done' ? '아직 없음' : '—'}</span>
                  )}
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-md border border-border bg-card/40"
                      style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                        <span className="text-[13px] font-medium text-foreground">{storeLabel(c.store)} EK43</span>
                        <span className="text-[11px] text-muted-foreground">{c.periodLabel}</span>
                      </div>
                      {c.memo && <span className="text-[11px] text-muted-foreground">{c.memo}</span>}
                      {c.status === 'done' && c.updatedAt && (
                        <span className="tabular text-[11px] text-muted-foreground">
                          {c.updatedAt.slice(5, 10).replace('-', '.')}
                          {c.updatedBy && ` · ${c.updatedBy.split('@')[0]}`}
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {c.status !== 'todo' && (
                          <button
                            onClick={() => move(c, c.status === 'done' ? 'doing' : 'todo')}
                            disabled={busy !== null}
                            className="ta-btn"
                            style={{ height: 26, paddingLeft: 8, paddingRight: 8, fontSize: 12 }}
                          >
                            ← 되돌리기
                          </button>
                        )}
                        {c.status !== 'done' && (
                          <button
                            onClick={() => move(c, c.status === 'todo' ? 'doing' : 'done')}
                            disabled={busy !== null}
                            className="ta-btn-primary"
                            style={{ height: 26, paddingLeft: 8, paddingRight: 8, fontSize: 12 }}
                          >
                            {c.status === 'todo' ? '진행 →' : '완료 ✓'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {past.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="text-[11px] text-muted-foreground">지난 체크</span>
              {past.map((c) => (
                <span key={c.id} className="tabular text-[11px] text-muted-foreground">
                  {c.periodLabel} · {storeLabel(c.store)} · {c.status === 'done' ? '완료' : '미완료'}
                  {c.memo ? ` · ${c.memo}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
