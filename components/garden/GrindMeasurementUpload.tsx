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

// EXIF 회전 반영 로드 (옵션 미지원 브라우저는 기본 동작 폴백) — TransferPanel과 동일 패턴
async function loadBitmap(file: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

// 컴퍼스 캡처(보통 PNG 2~5MB)를 업로드·AI 인식 앞에서 축소 — 원본 그대로 올리면 업로드가
// 느리다(2026-08-08 대표 지적). 히스토그램·숫자 가독성은 유지하도록 화면 캡처치곤 넉넉한
// 1800px·JPEG 0.85 사용 (사진 압축용 TransferPanel의 1400px·0.8보다 살짝 높게).
async function compressCapture(file: File): Promise<File> {
  try {
    const bmp = await loadBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file; // 압축이 오히려 커지면 원본 유지
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file; // 캔버스 실패(HEIC 등) — 원본으로 폴백, 서버가 그대로 받는다
  }
}

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
  // 이미지 업로드는 백그라운드(2026-08-08 대표 지적 — 업로드가 느려 저장 버튼이 오래 막힘).
  // 수치 저장은 즉시 끝나고, 이미지는 뒤에서 올라가며 이 상태만 별도로 진행률을 보여준다.
  const [bgUpload, setBgUpload] = useState<{ done: number; total: number; pct: number } | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
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

  // 컴퍼스 캡처 자동 판독 — 이미지를 고르면 Gemini 가 평균·표준편차·미분(제목의 다이얼까지) 읽어
  // 빈 칸을 채운다. 사용자가 이미 입력한 값은 덮지 않고, 판독값은 저장 전 확인·수정 가능.
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const scanImage = async (file: File) => {
    setScanning(true);
    setScanNote(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/garden-grind-scan', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `인식 실패 (${res.status})`);
      const e = j.extraction as { dial: number | null; meanUm: number | null; stdUm: number | null; finesPct: number | null };
      // 채울 값·안내 문구를 업데이트 함수 밖에서 계산 — updater 는 나중에 실행되므로
      // 그 안에서 목록을 채우면 메시지 시점엔 항상 비어 있다(2026-08-08 '못 찾았어요' 오표기 버그)
      const fills: { key: 'dial' | 'mean' | 'std' | 'fines'; value: string; label: string }[] = [];
      if (draft.dial.trim() === '' && e.dial != null) fills.push({ key: 'dial', value: String(e.dial), label: `다이얼 ${e.dial}` });
      if (draft.mean.trim() === '' && e.meanUm != null) fills.push({ key: 'mean', value: String(Math.round(e.meanUm)), label: `평균 ${Math.round(e.meanUm)}µm` });
      if (draft.std.trim() === '' && e.stdUm != null) fills.push({ key: 'std', value: String(Math.round(e.stdUm * 10) / 10), label: `σ ${Math.round(e.stdUm * 10) / 10}` });
      if (draft.fines.trim() === '' && e.finesPct != null) fills.push({ key: 'fines', value: String(e.finesPct), label: `미분 ${e.finesPct}%` });
      if (fills.length > 0) {
        // 스캔하는 1~2초 사이 사용자가 타이핑했을 수 있으니 적용 시점에 빈 칸만 채운다
        setDraft((d) => {
          const next = { ...d };
          for (const f of fills) if (d[f.key].trim() === '') next[f.key] = f.value;
          return next;
        });
      }
      const recognized = [e.dial, e.meanUm, e.stdUm, e.finesPct].some((v) => v != null);
      setScanNote(
        fills.length > 0
          ? `✓ 이미지에서 자동 입력: ${fills.map((f) => f.label).join(' · ')} — 확인 후 저장하세요`
          : recognized
            ? '인식됨 — 이미 입력된 값이 있어 덮지 않았어요'
            : '이미지에서 수치를 찾지 못했어요 — 직접 입력해주세요',
      );
    } catch (err) {
      setScanNote(`자동 인식 실패 — 직접 입력해주세요 (${(err as Error).message})`);
    } finally {
      setScanning(false);
    }
  };

  const canSave = draft.bean.trim() !== '' && draft.dial.trim() !== '' && (files.length > 0 || draft.mean.trim() !== '');

  // 이미지를 병렬 업로드(파일은 선택 시 이미 compressCapture 로 축소됨) 후 PATCH 로 붙인다.
  // save() 가 기다리지 않는 백그라운드 작업 — 실패해도 이미 저장된 수치 기록은 그대로 남는다.
  const uploadImagesInBackground = async (id: string, toUpload: File[]) => {
    if (toUpload.length === 0) return;
    setBgError(null);
    try {
      const perFilePct = new Array(toUpload.length).fill(0);
      const report = () =>
        setBgUpload({
          done: perFilePct.filter((p) => p >= 100).length,
          total: toUpload.length,
          pct: Math.round(perFilePct.reduce((s, p) => s + p, 0) / toUpload.length),
        });
      report();
      const uploaded = await Promise.all(
        toUpload.map((file, i) =>
          upload(`grind-measurements/${Date.now()}-${i}-${file.name}`, file, {
            access: 'public',
            handleUploadUrl: '/api/upload',
            onUploadProgress: ({ percentage }) => {
              perFilePct[i] = percentage;
              report();
            },
          }),
        ),
      );
      const res = await fetch('/api/garden-grind-measurements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, imageUrls: uploaded.map((b) => b.url) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? '이미지 첨부에 실패했습니다.');
      }
      const next = await res.json();
      setItems(next);
      primeGrindMeasurements(next);
    } catch (e) {
      setBgError(`이미지 업로드 실패(측정값은 저장됨) — ${(e as Error).message}`);
    } finally {
      setBgUpload(null);
    }
  };

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    // 저장 시점의 파일 스냅샷 — 아래에서 폼을 바로 비우므로 배경 업로드용으로 먼저 떼어둔다
    const toUpload = files;
    try {
      const id = crypto.randomUUID();
      const res = await fetch('/api/garden-grind-measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          store: draft.store,
          bean: draft.bean.trim(),
          roast: draft.roast,
          dial: Number(draft.dial),
          imageUrls: [], // 이미지는 이 요청을 기다리지 않고 아래에서 백그라운드로 붙는다
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
      setScanNote(null);
      void uploadImagesInBackground(id, toUpload); // 기다리지 않음 — 다음 측정을 바로 이어 입력 가능
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
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
      <div className="pb-[54px]" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
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
            + 컴퍼스 결과 이미지 선택 — 수치 자동 인식 {files.length > 0 && `(${files.length}장)`}
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={async (e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length === 0) return;
                // 선택 즉시 압축(보통 <1초/장) — 이후 인식·업로드가 이 축소본을 쓴다
                const compressed = await Promise.all(list.map(compressCapture));
                setFiles(compressed);
                scanImage(compressed[0]); // 첫 장 자동 판독 → 수치 자동 입력
              }}
            />
          </label>
          {(scanning || scanNote) && (
            <p
              className="text-[13px]"
              style={{
                margin: 0,
                color: scanning
                  ? 'hsl(var(--muted-foreground))'
                  : scanNote?.startsWith('✓')
                    ? 'hsl(150 60% 35%)'
                    : 'hsl(25 85% 45%)',
              }}
            >
              {scanning ? '⏳ 이미지에서 수치 인식 중…' : scanNote}
            </p>
          )}
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
          {saving ? '저장 중…' : '측정 기록 저장'}
        </button>

        {/* 이미지는 백그라운드로 올라간다 — 저장 버튼을 막지 않는다(2026-08-08 대표 지적) */}
        {bgUpload && (
          <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
            ⏳ 이미지 배경 업로드 중… {Math.min(bgUpload.done + 1, bgUpload.total)}/{bgUpload.total}장 ·{' '}
            {bgUpload.pct}% (측정값은 이미 저장됐어요)
          </p>
        )}
        {bgError && (
          <p className="text-[13px]" style={{ margin: 0, color: 'hsl(0 72% 45%)' }}>
            {bgError}
          </p>
        )}
      </div>

      {/* 측정 목록 — 날짜별 그룹, 날짜 안에서 두 지점 모두 있으면 비교 가능 표시 */}
      {days.length === 0 ? (
        <p className="pt-[54px] text-[13px] text-muted-foreground">아직 업로드된 측정 기록이 없어요. 프로토콜: 에티오피아 싱글 × 다이얼 6 / 8 / 10 × 각 3샷 × 두 지점.</p>
      ) : (
        <div className="pt-[54px]" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {days.map(([date, list]) => {
            const storesCovered = new Set(list.map((m) => m.store));
            const beanNames = Array.from(new Set(list.map((m) => m.bean.trim())));
            const roasts = Array.from(new Set(list.map((m) => m.roast)));
            return (
              <div key={date} className="rounded-md bg-muted/40 p-6" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                      <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }} title="측정 삭제" aria-label="측정 삭제">
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
