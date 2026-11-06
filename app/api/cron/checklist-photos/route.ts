import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { photoCutoff } from '@/lib/checklist/logic';
import { serviceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 체크리스트 사진 보관 크론(매일 03시 KST, vercel.json crons) — 90일 지난 사진만 지우고 체크 기록은 남긴다.
// 사람이 찍힐 수 있어 무기한 쌓지 않는다. 한 번에 200장, 남으면 다음 날 이어서. 인증은 Vercel 크론의 CRON_SECRET Bearer 헤더.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const { data, error } = await svc
    .from('checklist_checks')
    .select('id, photo_path')
    .not('photo_path', 'is', null)
    .lt('photo_taken_at', photoCutoff(new Date()))
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ ok: true, deleted: 0 });

  // 사진을 먼저 지운다 — 실패하면 기록을 그대로 두어 다음 날 다시 시도한다
  await del(data.map((c) => c.photo_path as string));
  const { error: upErr } = await svc
    .from('checklist_checks')
    .update({ photo_path: null, photo_deleted_at: new Date().toISOString() })
    .in('id', data.map((c) => c.id));
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: data.length });
}
