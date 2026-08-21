import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { unitOf } from '@/lib/finance/types';
import { loadPnlPos, computePnlMonth, type BrandSeg } from '@/lib/finance/pnlMonth';

export const runtime = 'nodejs';

// 월 결산 페이지의 손익 드릴다운용 — 한 달 관리손익 요약(공급가액·수수료·재료비·인건비…).
// 계산은 관리손익 페이지와 같은 코드(lib/finance/pnlMonth) — 두 화면 숫자가 항상 일치한다.
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

  const params = new URL(req.url).searchParams;
  const unit = unitOf(params.get('unit'));
  const ym = params.get('ym');
  if (!unit || unit.id === 'personal' || !ym || !/^\d{4}-\d{2}$/.test(ym)) {
    return NextResponse.json({ error: '단위(unit)와 월(YYYY-MM)이 필요합니다.' }, { status: 400 });
  }
  const seg = unit.brand as BrandSeg;

  try {
    const pos = await loadPnlPos(supabase, seg);
    const { p, channelFee } = await computePnlMonth(supabase, { seg, store: unit.store, ym, pos });
    // 드릴다운에 필요한 몫만 추려서 — byCategory 등 무거운 세부는 관리손익 페이지에서 본다
    return NextResponse.json({
      ym,
      sales: { gross: p.sales.gross, vat: p.sales.vat, supply: p.sales.supply },
      channelFee: { amount: p.channelFee.amount, estimated: p.channelFee.estimated },
      netSales: p.netSales,
      cogs: { total: p.cogs.total, invMissing: p.cogs.invMissing },
      grossProfit: p.grossProfit,
      labor: p.labor,
      fixed: p.fixed,
      cardLump: p.cardLump,
      payLump: p.payLump,
      misang: p.misang,
      unclassified: p.unclassified,
      operatingProfit: p.operatingProfit,
      feeInput: channelFee != null, // 수수료 실제 입력 여부(false = 추정률)
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '손익 계산에 실패했어요.' }, { status: 500 });
  }
}
