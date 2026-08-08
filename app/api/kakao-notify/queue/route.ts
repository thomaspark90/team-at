import { NextResponse } from 'next/server';
import { kakaoNotifyJobs } from '@/lib/kakao-notify';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 맥 로컬 카톡 전송기(~/Projects/kakao-order-notifier) 전용 —
// 대기 잡을 내려주고, 전송 결과를 받아 상태를 갱신한다.
// 세션 쿠키 없이 호출되므로 middleware PUBLIC_API 등록 — 토큰(x-kakao-token) 자체 인증.

const authed = (req: Request) => {
  const token = process.env.KAKAO_NOTIFY_TOKEN;
  return !!token && req.headers.get('x-kakao-token') === token;
};

/** 전송 대기 잡 목록 */
export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const pending = (await kakaoNotifyJobs.readAll()).filter((j) => j.status === 'pending').slice(0, 20);
  return NextResponse.json({ pending });
}

/** 전송 결과 보고: { id, ok: boolean, error?: string } */
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? '');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const job = await kakaoNotifyJobs.readOne(id);
  if (!job) return NextResponse.json({ error: '잡을 찾을 수 없습니다.' }, { status: 404 });
  // pending 이 아닌 잡은 덮지 않는다 — 전송기 재실행·중복 보고가 완료 상태를 되돌리는 것 방지
  if (job.status !== 'pending') return NextResponse.json({ ok: true });

  if (body?.ok) {
    job.status = 'sent';
    job.sentAt = new Date().toISOString();
    delete job.error;
  } else {
    job.status = 'failed';
    job.error = String(body?.error ?? '알 수 없는 오류').slice(0, 300);
  }
  await kakaoNotifyJobs.writeOne(job);
  return NextResponse.json({ ok: true });
}
