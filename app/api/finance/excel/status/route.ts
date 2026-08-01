import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { UPLOAD_SLOTS, type SlotStatus } from '@/lib/finance/uploadSlots';
import { getBrandBanks } from '@/lib/finance/brandBanks';
import { monthCoverage, type DayInterval } from '@/lib/finance/coverage';

export const runtime = 'nodejs';

// 월별 업로드 보드 상태 — 슬롯별 완료 여부 + 기간 커버리지(부분 업로드 감지).
// 이 보드에서 올린 것(uploads.slot)은 slot_ym 칸뿐 아니라 파일 기간이 겹치는 모든 달의
// 칸에 반영된다(여러 달치 파일을 한 칸에서 올려도 각 달이 체크됨). 그 외 기존 경로도 자동 감지:
//   신한/우리 = 은행 PDF 업로드(기간이 해당 월과 겹침), 주지출 카드 = 카드명세 업로드,
//   네이버 = 자동수집 거래 존재(매일 수집이라 월 전체로 간주).
// 완료 판정: 슬롯에 쌓인 업로드들의 기간 합집합이 월을 덮으면 full, 일부만 덮으면 부분(◐).
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '회계 입력 권한이 없습니다.' }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const ym = params.get('ym') ?? '';
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return NextResponse.json({ error: '월(ym)을 YYYY-MM 형식으로 주세요.' }, { status: 400 });
  }
  // 브랜드별 보드 — 상태도 그 브랜드 업로드·거래만 본다(미지정=garden, 기존 동작 유지)
  const brandRaw = params.get('brand') ?? 'garden';
  const brand = brandRaw === 'staffmeal' ? 'staffmeal' : 'garden';
  // 브랜드별 사용 은행 — 보드·월확정 게이트가 이 목록의 은행 슬롯만 요구한다
  const banks = await getBrandBanks(supabase, brand);
  const [y, m] = ym.split('-').map(Number);
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  // 슬롯별 수집: 업로드 건수·시각·경로 + 기간 구간들
  const acc: Record<
    string,
    { count: number; at: string | null; via: 'slot' | 'auto' | null; intervals: DayInterval[]; periodless: boolean; ids: number[] }
  > = {};
  for (const s of UPLOAD_SLOTS) acc[s.key] = { count: 0, at: null, via: null, intervals: [], periodless: false, ids: [] };
  const add = (key: string, u: { id?: unknown; row_count?: unknown; uploaded_at?: unknown; period_start?: unknown; period_end?: unknown }, via: 'slot' | 'auto') => {
    const a = acc[key];
    if (!a) return;
    a.count += Number(u.row_count ?? 0);
    a.at = String(u.uploaded_at ?? a.at ?? '');
    a.via = a.via ?? via;
    if (u.id != null) a.ids.push(Number(u.id));
    if (u.period_start && u.period_end) a.intervals.push({ start: String(u.period_start), end: String(u.period_end) });
    else a.periodless = true; // 구버전 기록(기간 없음) — 커버리지 판정 불가 → 완전으로 간주
  };

  // 1) 이 보드에서 올린 업로드 — 자기 월 칸(slot_ym) 또는 파일 기간이 이 달과 겹치는 것
  const { data: slotRows, error: slotErr } = await supabase
    .schema('finance')
    .from('uploads')
    .select('id,slot,row_count,uploaded_at,period_start,period_end')
    .eq('brand', brand)
    .not('slot', 'is', null)
    .or(`slot_ym.eq.${ym},and(period_start.lte.${monthEnd},period_end.gte.${monthStart})`)
    .order('uploaded_at');
  if (slotErr) {
    return NextResponse.json(
      {
        error: /slot/.test(slotErr.message)
          ? '업로드 보드 컬럼이 아직 없어요. 관리자가 supabase/migration_upload_slots.sql 을 실행해야 해요.'
          : slotErr.message,
      },
      { status: 500 }
    );
  }
  for (const r of slotRows ?? []) add(String(r.slot), r, 'slot');

  // 2) 기존 경로 자동 감지 — 은행 PDF·카드명세(기간이 해당 월과 겹치는 업로드).
  //    보드에서 올린 것(slot 있음)은 1)에서 이미 처리 — 쿠팡(card) 업로드가 카드 슬롯을 켜는 오인 방지.
  const { data: periodRows } = await supabase
    .schema('finance')
    .from('uploads')
    .select('id,bank,source,row_count,uploaded_at,period_start,period_end')
    .eq('brand', brand)
    .is('slot', null)
    .lte('period_start', monthEnd)
    .gte('period_end', monthStart)
    .order('uploaded_at');
  for (const r of periodRows ?? []) {
    const key =
      r.source === 'card'
        ? 'card_main'
        : r.bank === 'shinhan'
          ? 'bank_shinhan'
          : r.bank === 'woori'
            ? 'bank_woori'
            : null;
    if (key) add(key, r, 'auto');
  }

  // 업로드가 여러 달에 걸칠 수 있으니 칸 숫자는 row_count 합이 아니라 '이 달에 실제 저장된
  // 거래 수'로 다시 센다 — 보드 숫자 = 지출 자료 분류 화면 행 수. (네이버·쿠팡은 3)에서 별도 집계)
  for (const s of UPLOAD_SLOTS) {
    if (s.key === 'naverpay' || s.key === 'coupang') continue;
    const a = acc[s.key];
    if (a.ids.length === 0) continue;
    const { count } = await supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .in('upload_id', a.ids)
      .eq('ym', ym);
    a.count = count ?? 0;
  }

  // 3) 자동수집(네이버·쿠팡) — launchd 크롤러 거래가 이 달에 있으면 완료(매일 수집 = 월 전체).
  //    건수는 항상 이 달의 해당 소스 거래 수로 표기 — 보드 숫자 = 지출 자료 분류 화면 행 수.
  for (const key of ['naverpay', 'coupang'] as const) {
    const { count } = await supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('bank', key)
      .eq('brand', brand)
      .eq('ym', ym);
    acc[key].count = count ?? 0;
    if ((count ?? 0) > 0 && acc[key].via === null) {
      acc[key].via = 'auto';
      acc[key].intervals.push({ start: monthStart, end: monthEnd });
    }
  }

  const slots: Record<string, SlotStatus> = {};
  for (const s of UPLOAD_SLOTS) {
    const a = acc[s.key];
    const done = a.via !== null;
    const cov = monthCoverage(ym, a.intervals);
    // 기간 없는 구버전 기록만 있으면 판정 불가 → 완전으로 간주(기존 동작 유지)
    const full = done && (cov.full || (a.periodless && a.intervals.length === 0));
    slots[s.key] = { done, full, range: cov.label, count: a.count, at: a.at || null, via: a.via };
  }

  // 4) POS 매출 — 지점 단위 존재 여부(대시보드 현황 보드용). 업로드는 자료 입력 페이지에서.
  //    가든은 지점 2개(양재천 토스/판교 페이히어), 스탭밀은 단일('').
  const posStores = brand === 'garden' ? ['yangjae', 'pangyo'] : [''];
  const pos: Record<string, { done: boolean; days: number; supply: number }> = {};
  for (const st of posStores) {
    const { data: posRows } = await supabase
      .schema('finance')
      .from('pos_sales')
      .select('sale_date,supply')
      .eq('brand', brand)
      .eq('store', st)
      .eq('ym', ym);
    const rows = (posRows ?? []) as { sale_date: string; supply: number }[];
    pos[st] = {
      done: rows.length > 0,
      days: new Set(rows.map((r) => r.sale_date)).size,
      supply: rows.reduce((s, r) => s + Number(r.supply), 0),
    };
  }

  // 5) 분류·월확정 — 보드의 '분류·확정' 칸용. 월 스트립 배지(boardTodos)와 같은 규칙으로
  //    집계해 칸 배지 합 = 월 배지가 되게 한다: 미분류 출처 수 + 미확정 1.
  const unclBySource: Record<string, number> = {};
  for (const src of ['bank', 'card', 'naverpay', 'coupang'] as const) {
    const { count } = await supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('brand', brand)
      .eq('ym', ym)
      .eq('source', src)
      .is('category_id', null);
    if ((count ?? 0) > 0) unclBySource[src] = count ?? 0;
  }
  const classify = {
    total: Object.values(unclBySource).reduce((s, n) => s + n, 0),
    sources: Object.keys(unclBySource).length,
  };

  // 월확정은 단위별 (ym,brand,store) — 가든은 양재천·판교 둘 다 확정돼야 완료
  const requiredStores = brand === 'garden' ? ['yangjae', 'pangyo'] : [''];
  const { data: closeRows } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('store,status')
    .eq('brand', brand)
    .eq('ym', ym);
  const confirmedStores = new Set(
    (closeRows ?? []).filter((c) => c.status === 'confirmed').map((c) => String(c.store ?? ''))
  );
  const close = { confirmed: requiredStores.every((s) => confirmedStores.has(s)) };

  return NextResponse.json({ ym, slots, pos, classify, close, banks });
}
