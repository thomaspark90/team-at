import { get, put } from '@vercel/blob';

// 무인 수집기(쿠팡·네이버페이·리뷰) 최종 수신 기록 — 회계 홈의 상태 카드가 읽는다.
// 실패는 alert 라우트가 이메일로만 알렸는데, 로컬 Mac이 꺼져 있으면 alert 조차 오지 않아
// "며칠째 수집이 없다"는 걸 아무도 모르는 사각지대가 있었다. 서버가 마지막 수신 시각을
// 기록해 두면 무소식 자체를 화면에서 감지할 수 있다.
// 저장은 파이프라인당 blob 1개 — 수집기가 파이프라인마다 하나뿐이라 동시 쓰기 충돌이 없다.

export type IngestPipeline = 'coupang' | 'naverpay' | 'reviews';

export interface IngestHealth {
  pipeline: IngestPipeline;
  lastSuccessAt?: string; // 마지막 정상 수신(빈 결과 포함 — 수집기가 돌았다는 뜻)
  lastSummary?: string; // '저장 3 · 중복 12' 등 마지막 결과 요약
  lastFailureAt?: string; // 수집기가 alert 로 보고한 마지막 실패
  lastFailureReason?: string;
}

// 하루 1회(19시 launchd) 수집이 기준 — 30시간 무소식이면 지연으로 본다.
export const STALE_HOURS = 30;

export const PIPELINES: { key: IngestPipeline; label: string }[] = [
  { key: 'coupang', label: '쿠팡 주문' },
  { key: 'naverpay', label: '네이버페이 지출' },
  { key: 'reviews', label: '네이버 리뷰' },
];

const pathOf = (p: IngestPipeline) => `data/ingest-health/${p}.json`;

async function readOne(pipeline: IngestPipeline): Promise<IngestHealth> {
  try {
    const res = await get(pathOf(pipeline), { access: 'private', useCache: false });
    if (!res) return { pipeline };
    return { ...(JSON.parse(await new Response(res.stream).text()) as IngestHealth), pipeline };
  } catch {
    return { pipeline };
  }
}

async function write(pipeline: IngestPipeline, patch: Partial<IngestHealth>): Promise<void> {
  const cur = await readOne(pipeline);
  await put(pathOf(pipeline), JSON.stringify({ ...cur, ...patch, pipeline }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** ingest 성공 시 호출 — 기록 실패가 수집 응답을 깨지 않도록 호출부에서 catch 없이 써도 안전하다. */
export async function recordIngestSuccess(pipeline: IngestPipeline, summary?: string): Promise<void> {
  try {
    await write(pipeline, { lastSuccessAt: new Date().toISOString(), lastSummary: summary });
  } catch {
    /* 상태 기록은 부가 기능 — 실패해도 수집을 막지 않는다 */
  }
}

/** 수집기 실패 보고(alert) 시 호출. */
export async function recordIngestFailure(pipeline: IngestPipeline, reason: string): Promise<void> {
  try {
    await write(pipeline, { lastFailureAt: new Date().toISOString(), lastFailureReason: reason.slice(0, 200) });
  } catch {
    /* 위와 동일 */
  }
}

/** 상태 카드용 전체 조회. */
export async function readIngestHealth(): Promise<IngestHealth[]> {
  return Promise.all(PIPELINES.map((p) => readOne(p.key)));
}

// ── 상태 판정 — 회계 홈 카드와 크론 알림이 같은 규칙을 쓴다 ──

export type IngestStatus = 'ok' | 'late' | 'failed' | 'none';

/** 실패가 성공보다 최근이면 실패, 성공이 STALE_HOURS 를 넘으면 지연, 기록 없으면 none. */
export function judgeIngest(h: IngestHealth, now = Date.now()): { status: IngestStatus; note: string } {
  const success = h.lastSuccessAt ? new Date(h.lastSuccessAt).getTime() : 0;
  const failure = h.lastFailureAt ? new Date(h.lastFailureAt).getTime() : 0;
  if (!success && !failure) return { status: 'none', note: '수신 기록 없음' };
  if (failure > success) return { status: 'failed', note: h.lastFailureReason ?? '수집 실패' };
  const hours = (now - success) / 3_600_000;
  if (hours > STALE_HOURS) {
    const label = hours >= 48 ? `${Math.floor(hours / 24)}일` : `${Math.round(hours)}시간`;
    return { status: 'late', note: `${label} 무소식` };
  }
  return { status: 'ok', note: h.lastSummary ?? '정상' };
}

// ── 크론 알림 중복 방지 — 같은 문제로 매일 알리지 않도록 마지막 발송 시각을 기록 ──

const ALERT_STATE_PATH = 'data/ingest-health/alert-state.json';
const REALERT_HOURS = 20; // 하루 1회 크론 기준, 같은 문제는 하루 한 번만

export async function shouldAlert(pipeline: IngestPipeline): Promise<boolean> {
  try {
    const res = await get(ALERT_STATE_PATH, { access: 'private', useCache: false });
    if (!res) return true;
    const state = JSON.parse(await new Response(res.stream).text()) as Record<string, string>;
    const last = state[pipeline] ? new Date(state[pipeline]).getTime() : 0;
    return Date.now() - last > REALERT_HOURS * 3_600_000;
  } catch {
    return true;
  }
}

export async function markAlerted(pipelines: IngestPipeline[]): Promise<void> {
  try {
    let state: Record<string, string> = {};
    const res = await get(ALERT_STATE_PATH, { access: 'private', useCache: false });
    if (res) state = JSON.parse(await new Response(res.stream).text()) as Record<string, string>;
    const now = new Date().toISOString();
    for (const p of pipelines) state[p] = now;
    await put(ALERT_STATE_PATH, JSON.stringify(state), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch {
    /* 중복 방지 기록 실패 = 다음 날 한 번 더 알릴 뿐 — 치명적이지 않다 */
  }
}
