import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';

export const runtime = 'nodejs';

// 직원용 읽기 전용 링크 — GET 지점별 토큰 / POST { store } 새 링크 발급(이전 링크는 즉시 무효).
export async function GET() {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const { data, error } = await a.svc.from('schedule_share_links').select('store, token');
  if (error) return dbError(error);
  return NextResponse.json({ links: Object.fromEntries((data ?? []).map((l) => [l.store, l.token])) });
}

export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');
  const token = randomBytes(24).toString('base64url');
  const { error } = await a.svc
    .from('schedule_share_links')
    .upsert({ store: b.store, token, created_by: a.email, created_at: new Date().toISOString() }, { onConflict: 'store' });
  if (error) return dbError(error);
  return NextResponse.json({ token });
}
