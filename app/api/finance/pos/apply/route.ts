import { NextResponse } from 'next/server';
import { parsePosXlsx } from '@/lib/finance/pos';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MIGRATION_HINT =
  'POS 매출 테이블이 아직 없어요. Supabase SQL Editor 에서 supabase/migration_pos_pnl.sql 을 먼저 실행해주세요.';
const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /Could not find the table/i.test(e.message ?? ''));

// 토스 매출리포트 → pos_sales 저장. 파일에 든 달을 upsert(덮어쓰기)하고,
// 이번 업로드에 없는 옛 행만 정리(월 단위 교체). 확정된 달은 덮어쓰기 금지.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '저장 권한이 없습니다.' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const password = String(form.get('password') ?? '0000') || '0000';
  if (!(file instanceof File)) return NextResponse.json({ error: '엑셀 파일을 선택하세요.' }, { status: 400 });

  let r;
  try {
    r = await parsePosXlsx(new Uint8Array(await file.arrayBuffer()), password);
  } catch (e) {
    return NextResponse.json({ error: `파일을 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
  if (r.rows.length === 0) {
    return NextResponse.json({ error: '저장할 매출이 없습니다.' }, { status: 422 });
  }

  // 확정된 달 보호
  const { data: closed, error: closeErr } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('ym,status')
    .in('ym', r.yms)
    .eq('status', 'confirmed');
  if (closeErr && !isMissingTable(closeErr)) {
    return NextResponse.json({ error: `확정월 확인 실패: ${closeErr.message}` }, { status: 500 });
  }
  if (closed && closed.length > 0) {
    return NextResponse.json(
      { error: `이미 확정된 달(${closed.map((c: { ym: string }) => c.ym).join(', ')})은 덮어쓸 수 없습니다.` },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const rows = r.rows.map((d) => ({
    ym: d.ym,
    sale_date: d.saleDate,
    category: d.category,
    qty: d.qty,
    gross: d.gross,
    vat: d.vat,
    supply: d.supply,
    uploaded_by: user.id,
    uploaded_at: now,
  }));

  // 월 단위 교체 = upsert(있으면 덮어쓰기) 후, 이번 업로드에 없는 옛 행만 정리.
  // 삭제-먼저 방식과 달리 테이블이 비어 있어도/재업로드도 안전.
  const { error: upErr } = await supabase
    .schema('finance')
    .from('pos_sales')
    .upsert(rows, { onConflict: 'sale_date,category' });
  if (upErr) {
    if (isMissingTable(upErr)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 400 });
    return NextResponse.json({ error: `매출 저장 실패: ${upErr.message}` }, { status: 500 });
  }

  // 잔여 정리(비치명적): 같은 달인데 이번 파일엔 없는 (일×카테고리) 옛 행 제거
  const { error: delErr } = await supabase
    .schema('finance')
    .from('pos_sales')
    .delete()
    .in('ym', r.yms)
    .lt('uploaded_at', now);

  await logActivity(supabase, user, 'POS 매출 업로드', `${r.ym} ${rows.length}행`);

  return NextResponse.json({
    ym: r.ym,
    yms: r.yms,
    inserted: rows.length,
    supply: r.totals.supply,
    excludedRows: r.excluded.rows,
    staleCleaned: !delErr,
  });
}
