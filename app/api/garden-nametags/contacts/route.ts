import { NextResponse } from 'next/server';
import { cleanPhone } from '@/lib/garden/nametags';
import { badRequest, printRecipients, readContacts, requireNametagActor, writeContacts } from '@/lib/garden/nametags-server';

export const runtime = 'nodejs';

// 네임택 담당자 이름·연락처 — 스탭 화면의 '받는 사람'과 완료 알림의 '인쇄 담당'에 쓰인다(관리 탭).
// GET: 지금 알림을 받는 담당자 목록. PUT: { email, name, phone } 한 사람 저장.
export async function GET() {
  const a = await requireNametagActor(true);
  if (a instanceof NextResponse) return a;
  return NextResponse.json({ contacts: await printRecipients(a.supabase) });
}

export async function PUT(req: Request) {
  const a = await requireNametagActor(true);
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => ({}))) as { email?: unknown; name?: unknown; phone?: unknown };
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email.includes('@')) return badRequest('담당자를 찾지 못했습니다.');
  const map = await readContacts();
  map[email] = { name: typeof b.name === 'string' ? b.name.trim().slice(0, 30) : '', phone: cleanPhone(b.phone) };
  await writeContacts(map);
  return NextResponse.json({ contacts: await printRecipients(a.supabase) });
}
