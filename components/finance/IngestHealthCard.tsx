import { PIPELINES, STALE_HOURS, judgeIngest, type IngestHealth, type IngestStatus } from '@/lib/ingest-health';

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

export default function IngestHealthCard({ health }: { health: IngestHealth[] }) {
  const byKey = new Map(health.map((h) => [h.pipeline, h]));
  return (
    <section>
      <h2 className="m-0 text-[15px] font-medium">자동 수집 상태</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        로컬 수집기(매일 19시)의 마지막 수신 기록이에요. {STALE_HOURS}시간 넘게 소식이 없으면 지연으로 표시합니다.
      </p>
      {/* 박스 안의 박스는 시각적 소음 — 상태는 색 점이 이미 전달하므로 보더 없는 행으로 (2026-08-08) */}
      <div className="mt-2 divide-y divide-border/60">
        {PIPELINES.map(({ key, label }) => {
          const h = byKey.get(key) ?? { pipeline: key };
          const { status, note } = judgeIngest(h);
          return (
            <div key={key} className="flex items-center gap-2 py-2.5">
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: DOT[status], flexShrink: 0 }} />
              <span className="shrink-0 text-[13px] font-medium">{label}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground" title={note}>
                {note}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {LABEL[status]} · {ago(h.lastSuccessAt)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
