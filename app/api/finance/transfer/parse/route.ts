import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractTransferInfo } from '@/lib/finance/transfer';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 영수증/명세서 이미지 → Gemini 추출 → 거래처 계좌장부 조회까지 해서 미리보기 반환.
// 등록(저장)은 사용자가 확인창에서 확정한 뒤 /api/finance/transfer POST 로.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY가 없어요. .env.local에 키를 추가하고 서버를 재시작해주세요.' },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '이미지를 선택하세요.' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요.' }, { status: 400 });
  }

  let extraction;
  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    extraction = await extractTransferInfo(base64, file.type, key);
  } catch (e) {
    return NextResponse.json(
      { error: `이미지를 읽지 못했어요: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  // 계좌장부 조회 — 명세서에 계좌가 없으면 저장된 계좌로 채우고, 있으면 비교용으로 함께 반환
  let savedAccount: { bank: string | null; account_no: string | null; account_holder: string | null } | null = null;
  if (extraction.vendor_name) {
    const { data } = await supabase
      .schema('finance')
      .from('vendor_accounts')
      .select('bank,account_no,account_holder')
      .ilike('vendor_name', extraction.vendor_name)
      .maybeSingle();
    savedAccount = data ?? null;
    if (savedAccount && !extraction.account_no) {
      extraction.bank = extraction.bank ?? savedAccount.bank;
      extraction.account_no = savedAccount.account_no;
      extraction.account_holder = extraction.account_holder ?? savedAccount.account_holder;
    }
  }

  return NextResponse.json({ extraction, savedAccount });
}
