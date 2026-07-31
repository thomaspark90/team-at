import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

export interface SourceStatus {
  total: number;
  unclassified: number;
  byBank: Record<string, number>; // 미분류의 은행별 내역(은행 출처 타일 캡션용)
}

// 지출 자료 분류 보드 상태 — 해당 월 거래를 출처(은행/카드/네이버)별로 집계 + 월 확정 상태.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '회계 권한이 없습니다.' }, { status: 403 });
  }

  const ym = new URL(req.url).searchParams.get('ym') ?? '';
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return NextResponse.json({ error: '월(ym)을 YYYY-MM 형식으로 주세요.' }, { status: 400 });
  }

  const { data: txns, error } = await supabase
    .schema('finance')
    .from('transactions')
    .select('bank,source,category_id')
    .eq('ym', ym);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sources: Record<'bank' | 'card' | 'naverpay', SourceStatus> = {
    bank: { total: 0, unclassified: 0, byBank: {} },
    card: { total: 0, unclassified: 0, byBank: {} },
    naverpay: { total: 0, unclassified: 0, byBank: {} },
  };
  for (const t of txns ?? []) {
    const src = ((t.source as string) ?? 'bank') as keyof typeof sources;
    const bucket = sources[src] ?? sources.bank;
    bucket.total++;
    if (t.category_id == null) {
      bucket.unclassified++;
      const b = String(t.bank ?? '');
      bucket.byBank[b] = (bucket.byBank[b] ?? 0) + 1;
    }
  }

  const { data: close } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('status')
    .eq('ym', ym)
    .maybeSingle();

  return NextResponse.json({
    ym,
    sources,
    closeStatus: close?.status ?? 'open', // open | submitted | confirmed
  });
}
