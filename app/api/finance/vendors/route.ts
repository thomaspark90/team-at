import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { logActivity } from '@/lib/finance/activity';

export const runtime = 'nodejs';

// 거래처 계좌장부 관리 — admin/classifier 전용 (자동학습 upsert는 등록 API가 별도로 수행)
async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return { error: NextResponse.json({ error: '계좌장부 관리 권한이 없어요.' }, { status: 403 }) };
  }
  return { supabase, user };
}

async function list(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .schema('finance')
    .from('vendor_accounts')
    .select('id,vendor_name,bank,account_no,account_holder,updated_at')
    .order('vendor_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function GET() {
  const g = await requireStaff();
  if ('error' in g) return g.error;
  try {
    return NextResponse.json({ vendors: await list(g.supabase) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// 추가 또는 수정 — id 있으면 수정, 없으면 추가
export async function PUT(req: Request) {
  const g = await requireStaff();
  if ('error' in g) return g.error;
  const b = (await req.json()) as {
    id?: number;
    vendor_name?: string;
    bank?: string;
    account_no?: string;
    account_holder?: string;
  };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const vendorName = str(b.vendor_name);
  if (!vendorName) return NextResponse.json({ error: '거래처명을 입력하세요.' }, { status: 400 });

  const row = {
    vendor_name: vendorName,
    bank: str(b.bank),
    account_no: str(b.account_no),
    account_holder: str(b.account_holder),
    updated_at: new Date().toISOString(),
  };
  const q = g.supabase.schema('finance').from('vendor_accounts');
  const { error } = b.id
    ? await q.update(row).eq('id', b.id)
    : await q.upsert(row, { onConflict: 'vendor_name' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(g.supabase, g.user, b.id ? '거래처 계좌 수정' : '거래처 계좌 추가', vendorName);
  return NextResponse.json({ vendors: await list(g.supabase) });
}

export async function DELETE(req: Request) {
  const g = await requireStaff();
  if ('error' in g) return g.error;
  const { id } = (await req.json()) as { id?: number };
  if (!id) return NextResponse.json({ error: 'id가 없어요.' }, { status: 400 });
  const { data: removed, error } = await g.supabase
    .schema('finance')
    .from('vendor_accounts')
    .delete()
    .eq('id', id)
    .select('vendor_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (removed?.length) await logActivity(g.supabase, g.user, '거래처 계좌 삭제', removed[0].vendor_name);
  return NextResponse.json({ vendors: await list(g.supabase) });
}
