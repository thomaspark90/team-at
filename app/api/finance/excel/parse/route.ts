import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import { dedupe } from '@/lib/finance/parse';
import { fileToRows, inferMapping, rowsToTransactions } from '@/lib/finance/excel';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 미리보기: 엑셀 → AI 열 매핑 → 변환 → DB 지문 대조. 매핑을 응답에 실어
// 저장 요청 때 되돌려받는다(저장 시 AI 재호출·판정 흔들림 방지).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '회계 입력 권한이 없습니다.' }, { status: 403 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 없어요.' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '엑셀 파일을 선택하세요.' }, { status: 400 });
  }

  try {
    const rows = fileToRows(new Uint8Array(await file.arrayBuffer()));
    if (rows.length < 2) {
      return NextResponse.json({ error: '시트에서 데이터를 찾지 못했어요.' }, { status: 422 });
    }
    const mapping = await inferMapping(rows, key);
    const result = rowsToTransactions(rows, mapping);
    if (result.totalRows === 0) {
      return NextResponse.json({ error: '거래를 읽지 못했어요. 거래내역 형태의 엑셀인지 확인해주세요.' }, { status: 422 });
    }

    const existing = await fetchExistingHashes(
      supabase,
      result.transactions.map((t) => t.dedupHash)
    );
    const { fresh, duplicates } = dedupe(result.transactions, existing);

    return NextResponse.json({
      mapping,
      totalRows: result.totalRows,
      skipped: result.skipped,
      sumIn: result.sumIn,
      sumOut: result.sumOut,
      fresh: fresh.length,
      duplicates,
      sample: fresh.slice(0, 200),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
