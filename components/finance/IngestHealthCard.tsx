import {
  PIPELINES,
  STALE_HOURS,
  judgeIngest,
  type IngestHealth,
  type IngestStatus,
  type InfraHealth,
} from '@/lib/ingest-health';

// 무인 수집기 상태 카드 — 회계 홈에서 쿠팡·네이버페이·리뷰 파이프라인의 마지막 수신을 보여준다.
// 판정 규칙은 lib/ingest-health.judgeIngest — 크론 알림과 같은 기준을 쓴다.

type Status = IngestStatus;

const ago = (iso?: string) => {
  if (!iso) return '—';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 60 / 24)}일 전`;
};

const DOT: Record<Status, string> = {
  ok: 'hsl(152 60% 42%)',
  late: 'hsl(38 92% 50%)',
  failed: 'hsl(0 72% 51%)',
  none: 'hsl(var(--muted-foreground))',
};

const LABEL: Record<Status, string> = { ok: '정상', late: '지연', failed: '실패', none: '기록 없음' };

// compact: 회계 홈 보조 패널용 한 줄 — 점 + 이름 나열, 아래에 마지막 수신·이상 개수(2026-09-09 소프트 UI 4단계)
export default function IngestHealthCard({ health, infra, compact = false }: { health: IngestHealth[]; infra?: InfraHealth | null; compact?: boolean }) {
  const byKey = new Map(health.map((h) => [h.pipeline, h]));
  if (compact) {
    const rows = PIPELINES.map(({ key, label }) => {
      const h = byKey.get(key) ?? { pipeline: key };
      return { key, label, ...judgeIngest(h), last: h.lastSuccessAt };
    });
    const bad = rows.filter((r) => r.status !== 'ok').length + (infra && !infra.blob.ok ? 1 : 0);
    const latest = rows.map((r) => r.last).filter(Boolean).sort().at(-1);
    return (
      <div className="ta-panel">
        <div className="text-body font-medium">자동 수집</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-muted-foreground">
          {infra && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: infra.blob.ok ? DOT.ok : DOT.failed }} />
              저장소
            </span>
          )}
          {rows.map((r) => (
            <span key={r.key} className="inline-flex items-center gap-1.5" title={r.note}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: DOT[r.status] }} />
              {r.label}
            </span>
          ))}
        </div>
        <p className="mt-2 text-caption text-muted-foreground">
          마지막 수신 {ago(latest)} · {bad === 0 ? '전부 정상' : `확인 필요 ${bad}`}
        </p>
      </div>
    );
  }
  return (
    <section>
      <h2 className="m-0 text-title font-medium">자동 수집 상태</h2>
      <p className="mt-1 text-body text-muted-foreground">
        로컬 수집기(매일 19시)의 마지막 수신 기록이에요. {STALE_HOURS}시간 넘게 소식이 없으면 지연으로 표시합니다.
      </p>
      {/* 박스 안의 박스는 시각적 소음 — 상태는 색 점이 이미 전달하므로 보더 없는 행으로 (2026-08-08) */}
      <div className="mt-4 divide-y divide-border/60">
        {/* 인프라(파일 저장소) 생사 — Blob 정지 사고(2026-08-20) 후 페이지 열 때마다 직접 확인 */}
        {infra && (
          <div className="flex items-center gap-2 py-5">
            <span
              aria-hidden
              style={{ width: 8, height: 8, borderRadius: 99, background: infra.blob.ok ? DOT.ok : DOT.failed, flexShrink: 0 }}
            />
            <span className="shrink-0 text-body font-medium">파일 저장소</span>
            <span className="min-w-0 flex-1 truncate text-body text-muted-foreground" title={infra.blob.note}>
              {infra.blob.note}
            </span>
            <span className="shrink-0 text-caption text-muted-foreground">{infra.blob.ok ? '정상' : '장애'}</span>
          </div>
        )}
        {PIPELINES.map(({ key, label }) => {
          const h = byKey.get(key) ?? { pipeline: key };
          const { status, note } = judgeIngest(h);
          return (
            <div key={key} className="flex items-center gap-2 py-5">
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: DOT[status], flexShrink: 0 }} />
              <span className="shrink-0 text-body font-medium">{label}</span>
              <span className="min-w-0 flex-1 truncate text-body text-muted-foreground" title={note}>
                {note}
              </span>
              <span className="shrink-0 text-caption text-muted-foreground">
                {LABEL[status]} · {ago(h.lastSuccessAt)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
