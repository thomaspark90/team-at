import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { notifyTransferDone } from '@/lib/notify';

export const runtime = 'nodejs';

// 이체 완료/되돌리기 — admin·classifier 만 (RLS 로도 이중 차단)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '이체 완료 처리 권한이 없습니다.' }, { status: 403 });
  }

  const { action } = (await req.json()) as { action?: string };
  const done = action === 'done';
  if (!done && action !== 'undo') {
    return NextResponse.json({ error: 'action 은 done 또는 undo 여야 해요.' }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .schema('finance')
    .from('transfer_requests')
    .update(
      done
        ? { status: 'done', done_by: user.id, done_by_email: user.email ?? '', done_at: new Date().toISOString() }
        : { status: 'pending', done_by: null, done_by_email: null, done_at: null }
    )
    .eq('id', Number(params.id))
    .select('vendor_name,amount,requester_email')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 요청한 직원에게 역방향 알림(완료 시에만). 실패해도 처리 자체는 성공.
  if (done && updated) {
    await notifyTransferDone(supabase, {
      vendorName: updated.vendor_name,
      amount: Number(updated.amount),
      requesterEmail: updated.requester_email,
      doneByEmail: user.email ?? '',
    });
  }
  return NextResponse.json({ ok: true });
}

// 삭제 — 본인이 올린 대기 건 또는 스태프(RLS 가 판정)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: deleted, error } = await supabase
    .schema('finance')
    .from('transfer_requests')
    .delete()
    .eq('id', Number(params.id))
    .select('id,image_path');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: '삭제할 수 없는 항목이에요.' }, { status: 403 });
  }
  const path = deleted[0].image_path as string | null;
  if (path) await del(path).catch(() => {});
  return NextResponse.json({ ok: true });
}
