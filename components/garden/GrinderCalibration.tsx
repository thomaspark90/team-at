'use client';

import { useEffect, useState } from 'react';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import { convertDial, fitDialToMicron } from '@/lib/grinder-calibration';

// 지점 간 그라인더 캘리브레이션 입력 — 언스페셜티 컴퍼스로 측정한 (다이얼, 평균 입자 µm)를
// 지점별로 등록하면 레시피의 분쇄도가 상대 지점 다이얼로 자동 환산된다.

const COMPASS_URL = 'https://community.unspecialty.com/compass/grinder';

interface RowDraft {
  dial: string;
  micron: string;
}

const rowsFrom = (profiles: GrinderProfiles, id: StoreId): RowDraft[] =>
  (profiles[id]?.points ?? []).map((p) => ({ dial: String(p.dial), micron: String(p.micron) }));

export default function GrinderCalibration({
  profiles,
  onSaved,
}: {
  profiles: GrinderProfiles;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<StoreId, RowDraft[]>>({
    pangyo: [],
    yangjae: [],
  });
  const [saving, setSaving] = useState<StoreId | null>(null);

  // 저장/새로고침 시 서버 값으로 재동기화
  useEffect(() => {
    setRows({ pangyo: rowsFrom(profiles, 'pangyo'), yangjae: rowsFrom(profiles, 'yangjae') });
  }, [profiles]);

  const setCell = (id: StoreId, i: number, key: keyof RowDraft, v: string) =>
    setRows((r) => ({
      ...r,
      [id]: r[id].map((row, j) => (j === i ? { ...row, [key]: v.replace(/[^\d.]/g, '') } : row)),
    }));
  const addRow = (id: StoreId) => setRows((r) => ({ ...r, [id]: [...r[id], { dial: '', micron: '' }] }));
  const removeRow = (id: StoreId, i: number) =>
    setRows((r) => ({ ...r, [id]: r[id].filter((_, j) => j !== i) }));

  const save = async (id: StoreId) => {
    if (saving) return;
    setSaving(id);
    await fetch('/api/garden-grinders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: id,
        points: rows[id]
          .map((r) => ({ dial: Number(r.dial), micron: Number(r.micron) }))
          .filter((p) => Number.isFinite(p.dial) && Number.isFinite(p.micron) && p.micron > 0),
      }),
    });
    onSaved();
    setSaving(null);
  };

  const ready =
    !!fitDialToMicron(profiles.pangyo?.points) && !!fitDialToMicron(profiles.yangjae?.points);
  const SAMPLE_DIALS = [5.5, 6, 6.5, 7, 7.5];

  return (
    <div className="min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-3 block text-[13px] text-muted-foreground hover:text-foreground"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: open ? undefined : 0 }}
      >
        그라인더 캘리브레이션 (EK43 지점 연동) {open ? '▴' : '▾'}
      </button>

      {open && (
        <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
            <a href={COMPASS_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              언스페셜티 컴퍼스
            </a>
            에서 각 지점 EK43을 측정해 다이얼별 <span className="tabular">평균 입자(µm)</span>를 지점마다{' '}
            <strong>2개 이상</strong> 등록하세요. 측정 원본(분포도 캡처)은{' '}
            <a href="/garden/calibration" className="underline hover:text-foreground">분쇄도 측정</a>
            에 올려두면 산식 고도화에 쓰입니다. 두 지점 모두 채워지면 레시피 분쇄도에 같은 메쉬가 되는 상대
            지점 다이얼이 자동 표시됩니다. (측정은 같은 원두로, 굵기 구간을 벌려서 — 예: 6.0과 8.0)
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {STORES.map((s) => {
              const fit = fitDialToMicron(profiles[s.id]?.points);
              return (
                <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span className="text-[13px] font-medium text-foreground">
                      {s.label} EK43
                    </span>
                    {fit && (
                      <span className="tabular text-[11px] text-muted-foreground">
                        ≈ {Math.round(fit.a)}µm / 다이얼 1.0
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="text-[11px] text-muted-foreground" style={{ width: 80 }}>다이얼</span>
                    <span className="text-[11px] text-muted-foreground">평균 입자(µm)</span>
                  </div>
                  {rows[s.id].map((row, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.dial}
                        onChange={(e) => setCell(s.id, i, 'dial', e.target.value)}
                        placeholder="6.5"
                        className="ta-input tabular"
                        style={{ width: 80 }}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.micron}
                        onChange={(e) => setCell(s.id, i, 'micron', e.target.value)}
                        placeholder="720"
                        className="ta-input tabular"
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <button
                        onClick={() => removeRow(s.id, i)}
                        className="text-muted-foreground hover:text-foreground"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
                        title="측정점 삭제"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => addRow(s.id)} className="ta-btn" style={{ height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 13 }}>
                      + 측정점
                    </button>
                    <button
                      onClick={() => save(s.id)}
                      disabled={saving !== null}
                      className="ta-btn-primary"
                      style={{ height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 13 }}
                    >
                      {saving === s.id ? '저장 중…' : '저장'}
                    </button>
                  </div>
                  {profiles[s.id]?.updatedAt && (
                    <span className="tabular text-[11px] text-muted-foreground">
                      {profiles[s.id]!.updatedAt!.slice(2, 10).replace(/-/g, '.')} 저장
                      {profiles[s.id]?.updatedBy && ` · ${profiles[s.id]!.updatedBy!.split('@')[0]}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 환산 미리보기 — 레시피 기준(양재천) → 판교 */}
          {ready ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="text-[11px] text-muted-foreground">다이얼 대응 미리보기 (양재천 → 판교, 같은 메쉬 기준)</span>
              <div className="rounded-md border border-border" style={{ display: 'grid', gridTemplateColumns: `repeat(${SAMPLE_DIALS.length}, 1fr)`, textAlign: 'center' }}>
                {SAMPLE_DIALS.map((d) => (
                  <div key={`y${d}`} className="tabular text-[13px] text-muted-foreground" style={{ padding: '6px 4px', borderBottom: '1px solid hsl(var(--border))' }}>
                    {d.toFixed(1)}
                  </div>
                ))}
                {SAMPLE_DIALS.map((d) => {
                  const c = convertDial(profiles, 'yangjae', 'pangyo', d);
                  return (
                    <div key={`p${d}`} className="tabular text-[13px] text-foreground" style={{ padding: '6px 4px' }}>
                      {c != null ? c.toFixed(1) : '—'}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground" style={{ margin: 0 }}>
              아직 다이얼 대응 계산 불가 — 두 지점 모두 측정점이 2개 이상이어야 해요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
