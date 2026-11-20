import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/finance/activity';
import { cleanPhone } from '@/lib/garden/nametags';
import { readGardenTopics, writeGardenTopics } from '@/lib/garden-notify-topics-server';
import { badRequest, printRecipients, readContacts, requireNametagActor, writeContacts } from '@/lib/garden/nametags-server';

export const runtime = 'nodejs';

// 네임택 '받는 사람' 등록·편집 — 요청 화면의 확인 패널에서 바로 고친다(2026-11-20 대표 지시).
// 받는 사람 = 알림 담당(nametagPrint 토픽) + 이름·연락처(contacts). 네임택 탭 권한이 있으면 누구나 바꿀 수 있다
// (매장 계정이 요청 직전에 받는 사람을 바로잡을 수 있게). 바꾼 기록은 활동 로그에 남는다.
// GET: { recipients, assigned }  — assigned 가 비어 있으면 recipients 는 폴백(원두 알림 수신자)이다.
// PUT: { email, name, phone, add? } — 이름·연락처 저장. add=true 면 받는 사람으로 등록까지.
// DELETE ?email= — 받는 사람에서 빼기(이름·연락처 기록은 남는다).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Actor = Exclude<Awaited<ReturnType<typeof requireNametagActor>>, NextResponse>;
const state = async (a: Actor) => ({
  recipients: await printRecipients(a.supabase),
  assigned: (await readGardenTopics()).nametagPrint ?? [],
});

export async function GET() {
  const a = await requireNametagActor();
  if (a instanceof NextResponse) return a;
  return NextResponse.json(await state(a));
}

export async function PUT(req: Request) {
  const a = await requireNametagActor();
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => ({}))) as { email?: unknown; name?: unknown; phone?: unknown; add?: unknown };
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) return badRequest('이메일을 확인해 주세요.');
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 30) : '';
  const phone = cleanPhone(b.phone);

  const contacts = await readContacts();
  contacts[email] = { name, phone };
  await writeContacts(contacts);

  if (b.add === true) {
    const topics = await readGardenTopics();
    const cur = (topics.nametagPrint ?? []).map((e) => e.toLowerCase());
    if (!cur.includes(email)) {
      topics.nametagPrint = [...cur, email];
      await writeGardenTopics(topics);
    }
  }
  await logActivity(a.supabase, a.user, b.add === true ? '가든서비스 네임택 받는 사람 등록' : '가든서비스 네임택 받는 사람 수정', `${name || email} · ${email}`);
  return NextResponse.json(await state(a));
}

export async function DELETE(req: Request) {
  const a = await requireNametagActor();
  if (a instanceof NextResponse) return a;
  const email = (new URL(req.url).searchParams.get('email') ?? '').trim().toLowerCase();
  const topics = await readGardenTopics();
  const cur = topics.nametagPrint ?? [];
  if (!cur.some((e) => e.toLowerCase() === email)) return badRequest('받는 사람 목록에 없습니다. 새로고침 후 다시 확인해 주세요.');
  topics.nametagPrint = cur.filter((e) => e.toLowerCase() !== email);
  await writeGardenTopics(topics);
  await logActivity(a.supabase, a.user, '가든서비스 네임택 받는 사람 제외', email);
  return NextResponse.json(await state(a));
}
