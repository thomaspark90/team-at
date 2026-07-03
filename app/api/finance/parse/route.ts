import { NextResponse } from 'next/server';
import { pdfToLayoutText } from '@/lib/finance/pdf';
import { parseStatement, dedupe } from '@/lib/finance/parse';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import type { BankSource } from '@/lib/finance/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 미리보기: 파싱 + DB 기존 지문 대조로 실제 신규/중복 산출
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '재무 입력 권한이 없습니다.' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const bank = form.get('bank') as BankSource | null;
  const password = (form.get('password') as string) || undefined;
  if (!(file instanceof File) || (bank !== 'shinhan' && bank !== 'woori')) {
    return NextResponse.json({ error: '파일과 은행을 선택하세요.' }, { status: 400 });
  }

  const data = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = await pdfToLayoutText(data, password);
  } catch (e) {
    const msg = (e as Error).message || '';
    return NextResponse.json(
      { error: /password/i.test(msg) ? 'PDF 비밀번호가 필요하거나 틀렸습니다.' : `PDF를 열지 못했습니다: ${msg}` },
      { status: 400 }
    );
  }

  const result = parseStatement(bank, text);
  if (result.totalRows === 0) {
    return NextResponse.json({ error: '거래를 읽지 못했습니다. 은행 선택을 확인하세요.' }, { status: 422 });
  }

  const existing = await fetchExistingHashes(
    supabase,
    result.transactions.map((t) => t.dedupHash)
  );
  const { fresh, duplicates } = dedupe(result.transactions, existing);

  return NextResponse.json({
    bank: result.bank,
    totalRows: result.totalRows,
    sumIn: result.sumIn,
    sumOut: result.sumOut,
    fresh: fresh.length,
    duplicates,
    sample: fresh.slice(0, 200),
  });
}

// dedup_hash 청크 조회(URL 길이 회피)
async function fetchExistingHashes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hashes: string[]
): Promise<Set<string>> {
  const set = new Set<string>();
  for (let i = 0; i < hashes.length; i += 100) {
    const { data } = await supabase
      .schema('finance')
      .from('transactions')
      .select('dedup_hash')
      .in('dedup_hash', hashes.slice(i, i + 100));
    (data ?? []).forEach((e: { dedup_hash: string }) => set.add(e.dedup_hash));
  }
  return set;
}
