import { NextResponse } from 'next/server';
import type { GardenTopicId } from '@/lib/garden-notify-topics';
import { GARDEN_TOPICS } from '@/lib/garden-notify-topics';
import { readGardenTopics, writeGardenTopics } from '@/lib/garden-notify-topics-server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { requireGardenTab } from '@/lib/access/guard';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPIC_IDS = GARDEN_TOPICS.map((t) => t.id);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  return NextResponse.json(await readGardenTopics());
}

// 담당자 목록 교체: { topic, emails: string[] }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const topic = body.topic as GardenTopicId;
  if (!TOPIC_IDS.includes(topic)) {
    return NextResponse.json({ error: '알림 항목이 올바르지 않습니다.' }, { status: 400 });
  }
  // '원두 수령 담당'은 알림이 아니라 권한 지정이다 — 설정 탭 권한이 있는 사람만 바꿀 수 있다
  // (가드가 없으면 누구나 API 로 자기 자신을 수령 담당에 넣을 수 있다)
  if (topic === 'beanReceive') {
    const denied = await requireGardenTab(supabase, user, 'settings');
    if (denied) return denied;
  }
  const emails = (Array.isArray(body.emails) ? body.emails : [])
    .map((e: unknown) => String(e).trim().toLowerCase())
    .filter((e: string) => EMAIL_RE.test(e));

  const map = await readGardenTopics();
  map[topic] = Array.from(new Set(emails));
  await writeGardenTopics(map);

  const label = GARDEN_TOPICS.find((t) => t.id === topic)?.label ?? topic;
  await logActivity(
    supabase,
    user,
    '가든서비스 알림 담당자 설정',
    `${label} · ${map[topic].length ? map[topic].join(', ') : '없음(폴백: 원두 수신자)'}`
  );
  return NextResponse.json(map);
}
