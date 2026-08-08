'use client';

import { upload } from '@vercel/blob/client';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GrindMeasurement, RoastLevel } from '@/lib/grind-measurements';
import { ROAST_LEVELS, roastLabel } from '@/lib/grind-measurements';
import { fetchGrindMeasurements, primeGrindMeasurements } from '@/lib/garden/measurements-cache';

// 분쇄도 측정 업로드 — 언스페셜티 컴퍼스 결과(캡처 이미지+수치)를 지점·원두·다이얼 단위로
// 등록한다. 같은 원두·같은 다이얼을 두 지점에서 측정해 쌓으면 환산 산식의 원천 데이터가 된다.

const COMPASS_URL = 'https://community.unspecialty.com/compass/grinder';

// 현행 측정 프로토콜 (2026-08-07 판교 재얼라인 이후) — 다이얼 6/8/10 × 각 3샷 × 두 지점
const PROTOCOL_DIALS = [6, 8, 10];
const SHOTS_PER_DIAL = 3;
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

interface Draft {
  store: StoreId;
  bean: string;
  roast: RoastLevel;
  dial: string;
  mean: string;
  std: string;
  fines: string;
  shareUrl: string;
  memo: string;
}

const EMPTY: Draft = {
  store: 'yangjae',
  bean: '',
  roast: 'light',
  dial: '',
  mean: '',
  std: '',
  fines: '',
  shareUrl: '',
  memo: '',
};

const storeLabel = (id: StoreId) => STORES.find((s) => s.id === id)?.label ?? id;

export default function GrindMeasurementUpload() {
  const [items, setItems] = useState<GrindMeasurement[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // 이미지 업로드 진행률 — 여러 장을 순차 업로드하므로 전체 기준(장수+현재 장 %)으로 환산해 표시
  const [uploadState, setUploadState] = useState<{ done: number; total: number; pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 같은 화면의 차트도 같은 목록을 쓰므로 공유 캐시를 거친다(중복 조회 방지)
  const refresh = () => fetchGrindMeasurements().then(setItems);

  useEffect(() => {
    refresh();
  }, []);

  // 파일 선택 시 미리보기 URL 생성·해제
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const set = <K extends keyof Draft>(key: K, v: Draft[K]) => setDraft((d) => ({ ...d, [key]: v }));

  const canSave = draft.bean.trim() !== '' && draft.dial.trim() !== '' && (files.length > 0 || draft.mean.trim() !== '');

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const imageUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadState({ done: i, total: files.length, pct: Math.round((i / files.length) * 100) });
        const blob = await upload(`grind-measurements/${Date.now()}-${file.name}`, file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          onUploadProgress: ({ percentage }) => {
            setUploadState({ done: i, total: files.length, pct: Math.round(((i + percentage / 100) / files.length) * 100) });
          },
        });
        imageUrls.push(blob.url);
      }
      setUploadState(null); // 이미지 끝 — 이후는 수치 저장(짧음)이라 '저장 중…'으로 전환
      const res = await fetch('/api/garden-grind-measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: draft.store,
          bean: draft.bean.trim(),
          roast: draft.roast,
          dial: Number(draft.dial),
          imageUrls,
          mean: draft.mean.trim() === '' ? undefined : Number(draft.mean),
          std: draft.std.trim() === '' ? undefined : Number(draft.std),
          fines: draft.fines.trim() === '' ? undefined : Number(draft.fines),
          shareUrl: draft.shareUrl.trim() || undefined,
          memo: draft.memo.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? '저장에 실패했습니다.');
      }
      const next = await res.json();
      setItems(next);
      primeGrindMeasurements(next); // 차트도 최신 목록을 쓰도록 캐시 갱신
      // 같은 원두·다이얼로 샷을 연속 업로드하는 프로토콜이라 지점·원두·다이얼은 유지
      setDraft((d) => ({ ...d, mean: '', std: '', fines: '', shareUrl: '', memo: '' }));
      setFiles([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setUploadState(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('이 측정 기록을 삭제할까요?')) return;
    const res = await fetch(`/api/garden-grind-measurements?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      const next = await res.json();
      setItems(next);
      primeGrindMeasurements(next);
    }
  };

  // 오늘(KST) 프로토콜 진행률 — 지점×다이얼(6/8/10)별 업로드된 샷 수
  const progress = useMemo(() => {
    const today = kstDay(new Date().toISOString());
    const m = new Map<string, number>();
    for (const it of items) {
      if (kstDay(it.createdAt) !== today) continue;
      const d = Math.round(it.dial * 10) / 10;
      if (!PROTOCOL_DIALS.includes(d)) continue;
      const key = `${it.store}:${d}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [items]);

  // 날짜별(측정 세션 단위)로 묶고, 각 날짜에 두 지점이 모두 측정됐는지(=비교 가능) 표시
  // createdAt은 UTC ISO 문자열이라 KST(+9)로 옮긴 날짜로 묶는다
  const days = useMemo(() => {
    const map = new Map<string, GrindMeasurement[]>();
    for (const m of items) {
      const key = new Date(new Date(m.createdAt).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

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
    // 카드 해체(2026-08-08) — 입력 폼·목록 섹션 경계는 가로 구분선으로만
    <div className="divide-y divide-border">
      <div className="pb-[54px]" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
          <a href={COMPASS_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            언스페셜티 컴퍼스
          </a>
          에서 측정한 결과 화면을 캡처해 올려주세요. 원두·다이얼이 같아야 지점 간 비교가 됩니다.{' '}
          <strong>평균 µm은 직접 입력해야 차트·메쉬 기준 계산에 반영됩니다</strong> — 이미지는 기록용으로만
          저장돼요.
        </p>
        <p className="text-[13px] text-foreground" style={{ margin: 0 }}>
          이번 프로토콜 (2026-08-07 판교 재얼라인 이후): <strong>에티오피아 싱글 × 다이얼 6 / 8 / 10 × 각 3샷</strong>
          (샷마다 촬영 각도 조금씩 회전, 이전 촬영 스펙과 동일) × 두 지점. 샷 1장 = 기록 1건으로 올려주세요.
        </p>

        {/* 오늘 진행률 — 지점×다이얼별 n/3 칩, 완료 시 ✓ */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {STORES.map((s) => {
            const total = PROTOCOL_DIALS.reduce((sum, d) => sum + Math.min(progress.get(`${s.id}:${d}`) ?? 0, SHOTS_PER_DIAL), 0);
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className="text-[11px] text-muted-foreground">
                  {s.label} 오늘 {total}/{PROTOCOL_DIALS.length * SHOTS_PER_DIAL}
                </span>
                {PROTOCOL_DIALS.map((d) => {
                  const n = progress.get(`${s.id}:${d}`) ?? 0;
                  const done = n >= SHOTS_PER_DIAL;
                  return (
                    <span
                      key={d}
                      className={`tabular rounded-md border px-2 py-0.5 text-[11px] ${
                        done ? 'border-foreground text-foreground' : 'border-border text-muted-foreground'
                      }`}
                    >
                      {d} · {Math.min(n, SHOTS_PER_DIAL)}/{SHOTS_PER_DIAL}
                      {done && ' ✓'}
                      {n > SHOTS_PER_DIAL && ` (+${n - SHOTS_PER_DIAL})`}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* 지점 */}
        <div style={{ display: 'flex', gap: 8 }}>
          {STORES.map((s) => (
            <button key={s.id} onClick={() => set('store', s.id)} style={segBtn(draft.store === s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        {/* 원두명 + 배전도 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          <input
            type="text"
            value={draft.bean}
            onChange={(e) => set('bean', e.target.value)}
            placeholder="원두명 * (예: 에티오피아 첼베사)"
            className="ta-input"
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ROAST_LEVELS.map((r) => (
              <button key={r.id} onClick={() => set('roast', r.id)} style={segBtn(draft.roast === r.id)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* 다이얼 + 컴퍼스 수치 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <label className="text-[11px] text-muted-foreground" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            EK43 다이얼 *
            <input type="text" inputMode="decimal" value={draft.dial} onChange={(e) => set('dial', e.target.value.replace(/[^\d.]/g, ''))} placeholder="6.5" className="ta-input tabular" />
          </label>
          <label className="text-[11px] text-muted-foreground" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            평균 크기(µm)
            <input type="text" inputMode="numeric" value={draft.mean} onChange={(e) => set('mean', e.target.value.replace(/[^\d.]/g, ''))} placeholder="720" className="ta-input tabular" />
          </label>
          <label className="text-[11px] text-muted-foreground" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            표준편차
            <input type="text" inputMode="numeric" value={draft.std} onChange={(e) => set('std', e.target.value.replace(/[^\d.]/g, ''))} placeholder="230" className="ta-input tabular" />
          </label>
          <label className="text-[11px] text-muted-foreground" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            미분 비율(%)
            <input type="text" inputMode="decimal" value={draft.fines} onChange={(e) => set('fines', e.target.value.replace(/[^\d.]/g, ''))} placeholder="12" className="ta-input tabular" />
          </label>
        </div>

        {/* 공유 URL + 메모 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          <input type="text" value={draft.shareUrl} onChange={(e) => set('shareUrl', e.target.value)} placeholder="컴퍼스 공유 URL (선택)" className="ta-input" />
          <input type="text" value={draft.memo} onChange={(e) => set('memo', e.target.value)} placeholder="메모 (선택)" className="ta-input" />
        </div>

        {/* 이미지 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="ta-btn" style={{ height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', paddingLeft: 12, paddingRight: 12, fontSize: 13, cursor: 'pointer', width: 'fit-content' }}>
            + 컴퍼스 결과 이미지 선택 {files.length > 0 && `(${files.length}장)`}
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          {previews.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {previews.map((src, i) => (
                // 로컬 미리보기(blob: URL)라 next/image 최적화 대상이 아님
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`선택한 이미지 ${i + 1}`} style={{ height: 72, borderRadius: 6, border: '1px solid hsl(var(--border))' }} />
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-[13px]" style={{ margin: 0, color: 'hsl(0 72% 45%)' }}>{error}</p>}

        {/* 비활성 사유 안내 — 버튼이 왜 안 눌리는지 화면이 말해준다(2026-08-08 대표 문의) */}
        {!canSave && !saving && (
          <p className="text-[13px]" style={{ margin: 0, color: 'hsl(25 85% 45%)' }}>
            저장하려면{' '}
            {[
              draft.bean.trim() === '' ? '원두명' : null,
              draft.dial.trim() === '' ? 'EK43 다이얼' : null,
              files.length === 0 && draft.mean.trim() === '' ? '평균 크기(µm) 또는 결과 이미지' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {' '}입력이 필요해요.
          </p>
        )}

        <button onClick={save} disabled={!canSave || saving} className="ta-btn-primary" style={{ height: 38, fontSize: 13, opacity: !canSave || saving ? 0.5 : 1 }}>
          {saving
            ? uploadState
              ? `업로드 중… ${Math.min(uploadState.done + 1, uploadState.total)}/${uploadState.total}장 · ${uploadState.pct}%`
              : '저장 중…'
            : '측정 기록 저장'}
        </button>
      </div>

      {/* 측정 목록 — 날짜별 그룹, 날짜 안에서 두 지점 모두 있으면 비교 가능 표시 */}
      {days.length === 0 ? (
        <p className="pt-[54px] text-[13px] text-muted-foreground">아직 업로드된 측정 기록이 없어요. 프로토콜: 에티오피아 싱글 × 다이얼 6 / 8 / 10 × 각 3샷 × 두 지점.</p>
      ) : (
        <div className="pt-[54px]" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {days.map(([date, list]) => {
            const storesCovered = new Set(list.map((m) => m.store));
            const beanNames = Array.from(new Set(list.map((m) => m.bean.trim())));
            const roasts = Array.from(new Set(list.map((m) => m.roast)));
            return (
              <div key={date} className="rounded-md bg-muted/40 p-6" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span className="tabular text-[15px] font-medium text-foreground">{date.replaceAll('-', '.')}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {beanNames.join(' · ')}
                    {roasts.length === 1 && ` (${roastLabel(roasts[0])})`}
                  </span>
                  <span className="tabular text-[11px] text-muted-foreground">{list.length}샷</span>
                  <span className="tabular text-[11px]" style={{ color: storesCovered.size === 2 ? 'hsl(150 60% 35%)' : 'hsl(var(--muted-foreground))' }}>
                    {storesCovered.size === 2 ? '두 지점 측정 완료 — 비교 가능' : `${storeLabel(Array.from(storesCovered)[0])}만 측정됨`}
                  </span>
                </div>
                {list
                  .slice()
                  .sort((a, b) => a.store.localeCompare(b.store) || a.dial - b.dial || a.createdAt.localeCompare(b.createdAt))
                  .map((m) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span className="tabular text-[13px] text-foreground" style={{ minWidth: 150 }}>
                        {storeLabel(m.store)} · 다이얼 {m.dial.toFixed(1)}
                      </span>
                      {beanNames.length > 1 && <span className="text-[11px] text-muted-foreground">{m.bean.trim()}</span>}
                      <span className="tabular text-[13px] text-muted-foreground">
                        {m.mean ? `평균 ${m.mean}µm` : '수치 미입력'}
                        {m.std ? ` · σ ${m.std}` : ''}
                        {m.fines != null ? ` · 미분 ${m.fines}%` : ''}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {m.imageUrls.map((u, i) => (
                          <a key={i} href={u} target="_blank" rel="noreferrer">
                            <Image src={u} alt={`${m.bean.trim()} 측정 이미지 ${i + 1}`} width={80} height={48} style={{ height: 48, width: 'auto', borderRadius: 4, border: '1px solid hsl(var(--border))' }} unoptimized />
                          </a>
                        ))}
                      </div>
                      <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }} title="측정 삭제">
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
