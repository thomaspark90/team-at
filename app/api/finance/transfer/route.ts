import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 송금 요청 목록 — 로그인한 누구나 열람
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const status = new URL(req.url).searchParams.get('status');
  let q = supabase
    .schema('finance')
    .from('transfer_requests')
    .select(
      'id,created_at,requester_email,vendor_name,doc_date,amount,items_summary,bank,account_no,account_holder,memo,image_path,status,done_by_email,done_at'
    )
    .order('created_at', { ascending: false })
    .limit(300);
  if (status === 'pending' || status === 'done') q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

// 송금 요청 등록 — 확인창에서 확정한 값 + 이미지. 로그인한 누구나.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  const fieldsRaw = form.get('fields');
  if (typeof fieldsRaw !== 'string') {
    return NextResponse.json({ error: '요청 정보가 없어요.' }, { status: 400 });
  }

  let f: Record<string, unknown>;
  try {
    f = JSON.parse(fieldsRaw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '요청 정보 형식이 잘못됐어요.' }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const vendorName = str(f.vendor_name);
  const amount = Number(f.amount);
  if (!vendorName) return NextResponse.json({ error: '거래처명을 입력하세요.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: '금액을 확인하세요.' }, { status: 400 });
  }

  // 원본 이미지 보관(비공개 Blob) — 송금 담당자가 대시보드에서 원본 확인용
  let imagePath: string | null = null;
  if (file instanceof File && file.type.startsWith('image/')) {
    imagePath = `transfers/${randomUUID()}.jpg`;
    await put(imagePath, file, {
      access: 'private',
      contentType: file.type,
      addRandomSuffix: false,
    });
  }

  const row = {
    requester_id: user.id,
    requester_email: user.email ?? '',
    vendor_name: vendorName,
    doc_date: str(f.doc_date),
    amount,
    items_summary: str(f.items_summary),
    bank: str(f.bank),
    account_no: str(f.account_no),
    account_holder: str(f.account_holder),
    memo: str(f.memo),
    image_path: imagePath,
  };
  const { data: inserted, error } = await supabase
    .schema('finance')
    .from('transfer_requests')
    .insert(row)
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 계좌장부 갱신 — 확인된 계좌를 기억해 다음 업로드 때 자동 완성
  if (row.account_no) {
    await supabase
      .schema('finance')
      .from('vendor_accounts')
      .upsert(
        {
          vendor_name: vendorName,
          bank: row.bank,
          account_no: row.account_no,
          account_holder: row.account_holder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'vendor_name' }
      );
  }

  return NextResponse.json({ id: inserted.id });
}
