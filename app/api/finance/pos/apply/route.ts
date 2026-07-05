import { NextResponse } from 'next/server';
import { parsePosXlsx } from '@/lib/finance/pos';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 토스 매출리포트 → pos_sales 저장. 해당 월(들) 전부 삭제 후 재삽입(월 단위 교체).
// 확정된 달은 덮어쓰기 금지.
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
  const { data: closed } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('ym,status')
    .in('ym', r.yms)
    .eq('status', 'confirmed');
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

  // 월 단위 교체: 파일에 포함된 ym 전부 삭제 후 재삽입
  const { error: delErr } = await supabase.schema('finance').from('pos_sales').delete().in('ym', r.yms);
  if (delErr) return NextResponse.json({ error: `기존 매출 삭제 실패: ${delErr.message}` }, { status: 500 });

  const { error: insErr } = await supabase.schema('finance').from('pos_sales').insert(rows);
  if (insErr) return NextResponse.json({ error: `매출 저장 실패: ${insErr.message}` }, { status: 500 });

  return NextResponse.json({
    ym: r.ym,
    yms: r.yms,
    inserted: rows.length,
    supply: r.totals.supply,
    excludedRows: r.excluded.rows,
  });
}
