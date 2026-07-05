import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

// 업로드 배치 취소(삭제): 그 배치 거래 삭제 + 부수효과 되돌리기.
//  - 신한카드: 연결한 통장 카드결제 건의 '카드대금정산' 잠금 해제
//  - 쿠팡 영수증: 원본 쿠팡 건의 '영수증분해' 잠금 해제
//  - 확정된 달 거래가 포함되면 차단
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
  }

  let body: { uploadId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const uploadId = body.uploadId;
  if (uploadId == null) return NextResponse.json({ error: 'uploadId가 필요합니다.' }, { status: 400 });

  // uploadId < 0: 이력 기록 없는 쿠팡 영수증 품목(과거 적용분) 일괄 취소
  if (uploadId < 0) {
    const { data: items } = await supabase
      .schema('finance')
      .from('transactions')
      .select('id,ym,approval_no')
      .eq('source', 'card')
      .eq('channel', '쿠팡영수증')
      .is('upload_id', null);
    const its = (items as { id: number; ym: string; approval_no: string | null }[] | null) ?? [];
    if (its.length === 0) return NextResponse.json({ deleted: 0, unlocked: 0 });
    const affectedYms = new Set<string>(its.map((t) => t.ym));
    const approvals = Array.from(new Set(its.map((t) => t.approval_no).filter(Boolean))) as string[];
    const { data: splitCat } = await supabase.schema('finance').from('categories').select('id').eq('type', 'excluded').eq('name', '영수증분해').maybeSingle();
    let parentIds: number[] = [];
    if (splitCat && approvals.length) {
      const { data: parents } = await supabase
        .schema('finance')
        .from('transactions')
        .select('id,ym')
        .eq('source', 'card')
        .eq('category_id', splitCat.id)
        .in('approval_no', approvals);
      const ps = (parents as { id: number; ym: string }[] | null) ?? [];
      parentIds = ps.map((p) => p.id);
      ps.forEach((p) => affectedYms.add(p.ym));
    }
    const { data: closed } = await supabase.schema('finance').from('monthly_close').select('ym').eq('status', 'confirmed').in('ym', Array.from(affectedYms));
    if ((closed ?? []).length > 0) {
      const yms = (closed as { ym: string }[]).map((c) => c.ym).join(', ');
      return NextResponse.json({ error: `확정된 달(${yms})이 포함돼 삭제할 수 없습니다. 먼저 월 확정을 재오픈하세요.` }, { status: 409 });
    }
    if (parentIds.length > 0) {
      const { error: rErr } = await supabase.schema('finance').from('transactions').update({ category_id: null, classified_by: null, classified_at: null }).in('id', parentIds);
      if (rErr) return NextResponse.json({ error: `잠금 해제 실패: ${rErr.message}` }, { status: 500 });
    }
    const { error: dErr } = await supabase.schema('finance').from('transactions').delete().in('id', its.map((t) => t.id));
    if (dErr) return NextResponse.json({ error: `삭제 실패: ${dErr.message}` }, { status: 500 });
    return NextResponse.json({ deleted: its.length, unlocked: parentIds.length });
  }

  const { data: up } = await supabase
    .schema('finance')
    .from('uploads')
    .select('id,source,settled_tx_id')
    .eq('id', uploadId)
    .maybeSingle();
  if (!up) return NextResponse.json({ error: '업로드 기록을 찾을 수 없습니다.' }, { status: 404 });

  const { data: txns } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,ym,approval_no')
    .eq('upload_id', uploadId);
  const batch = (txns as { id: number; ym: string; approval_no: string | null }[] | null) ?? [];

  const affectedYms = new Set<string>(batch.map((t) => t.ym));

  // 부수효과 대상 수집
  let settledId: number | null = null;
  if (up.source === 'card' && up.settled_tx_id) {
    const { data } = await supabase.schema('finance').from('transactions').select('id,ym').eq('id', up.settled_tx_id).maybeSingle();
    if (data) {
      settledId = data.id;
      affectedYms.add(data.ym);
    }
  }
  let parentIds: number[] = [];
  if (up.source === 'receipt') {
    const approvals = Array.from(new Set(batch.map((t) => t.approval_no).filter(Boolean))) as string[];
    const { data: splitCat } = await supabase.schema('finance').from('categories').select('id').eq('type', 'excluded').eq('name', '영수증분해').maybeSingle();
    if (splitCat && approvals.length) {
      const { data: parents } = await supabase
        .schema('finance')
        .from('transactions')
        .select('id,ym')
        .eq('source', 'card')
        .eq('category_id', splitCat.id)
        .in('approval_no', approvals);
      const ps = (parents as { id: number; ym: string }[] | null) ?? [];
      parentIds = ps.map((p) => p.id);
      ps.forEach((p) => affectedYms.add(p.ym));
    }
  }

  // 확정월 가드
  if (affectedYms.size > 0) {
    const { data: closed } = await supabase
      .schema('finance')
      .from('monthly_close')
      .select('ym')
      .eq('status', 'confirmed')
      .in('ym', Array.from(affectedYms));
    if ((closed ?? []).length > 0) {
      const yms = (closed as { ym: string }[]).map((c) => c.ym).join(', ');
      return NextResponse.json({ error: `확정된 달(${yms})이 포함돼 삭제할 수 없습니다. 먼저 월 확정을 재오픈하세요.` }, { status: 409 });
    }
  }

  // 부수효과 되돌리기(잠금 해제)
  const revertIds = [...(settledId ? [settledId] : []), ...parentIds];
  if (revertIds.length > 0) {
    const { error: rErr } = await supabase
      .schema('finance')
      .from('transactions')
      .update({ category_id: null, classified_by: null, classified_at: null })
      .in('id', revertIds);
    if (rErr) return NextResponse.json({ error: `잠금 해제 실패: ${rErr.message}` }, { status: 500 });
  }

  // 배치 거래 삭제
  const { error: dErr } = await supabase.schema('finance').from('transactions').delete().eq('upload_id', uploadId);
  if (dErr) return NextResponse.json({ error: `거래 삭제 실패: ${dErr.message}` }, { status: 500 });

  // 업로드 기록 삭제(거래는 이미 지워졌으니 실패해도 데이터 정합성엔 문제없음 — 이력에만 빈 배치가 남음)
  const { error: upErr } = await supabase.schema('finance').from('uploads').delete().eq('id', uploadId);

  return NextResponse.json({ deleted: batch.length, unlocked: revertIds.length, uploadRecordRemoved: !upErr });
}
