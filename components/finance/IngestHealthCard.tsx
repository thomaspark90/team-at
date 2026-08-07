import { PIPELINES, STALE_HOURS, type IngestHealth } from '@/lib/ingest-health';

// 무인 수집기 상태 카드 — 회계 홈에서 쿠팡·네이버페이·리뷰 파이프라인의 마지막 수신을 보여준다.
// 판정: 실패가 성공보다 최근이면 '실패', 마지막 성공이 STALE_HOURS 를 넘으면 '지연',
// 기록 자체가 없으면 '기록 없음'(기능 도입 직후이거나 수집기가 한 번도 안 돈 상태).

type Status = 'ok' | 'late' | 'failed' | 'none';

function judge(h: IngestHealth): { status: Status; note: string } {
  const success = h.lastSuccessAt ? new Date(h.lastSuccessAt).getTime() : 0;
  const failure = h.lastFailureAt ? new Date(h.lastFailureAt).getTime() : 0;
  if (!success && !failure) return { status: 'none', note: '수신 기록 없음' };
  if (failure > success) return { status: 'failed', note: h.lastFailureReason ?? '수집 실패' };
  const hours = (Date.now() - success) / 3_600_000;
  if (hours > STALE_HOURS) return { status: 'late', note: `${Math.floor(hours / 24) >= 1 ? `${Math.floor(hours / 24)}일` : `${Math.round(hours)}시간`} 무소식` };
  return { status: 'ok', note: h.lastSummary ?? '정상' };
}

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
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="m-0 text-[15px] font-medium">자동 수집 상태</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        로컬 수집기(매일 19시)의 마지막 수신 기록이에요. {STALE_HOURS}시간 넘게 소식이 없으면 지연으로 표시합니다.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {PIPELINES.map(({ key, label }) => {
          const h = byKey.get(key) ?? { pipeline: key };
          const { status, note } = judge(h);
          return (
            <div key={key} className="rounded-xl border border-border bg-background px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: DOT[status], flexShrink: 0 }} />
                <span className="text-[13px] font-medium">{label}</span>
                <span className="ml-auto text-[12px] text-muted-foreground">{LABEL[status]}</span>
              </div>
              <p className="m-0 mt-1 truncate text-[12px] text-muted-foreground" title={note}>
                {note}
              </p>
              <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">
                마지막 수신 {ago(h.lastSuccessAt)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
