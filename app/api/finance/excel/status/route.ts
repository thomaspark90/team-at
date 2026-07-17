import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { UPLOAD_SLOTS, type SlotStatus } from '@/lib/finance/uploadSlots';
import { monthCoverage, type DayInterval } from '@/lib/finance/coverage';

export const runtime = 'nodejs';

// 월별 업로드 보드 상태 — 슬롯별 완료 여부 + 기간 커버리지(부분 업로드 감지).
// 이 보드에서 올린 것(uploads.slot/slot_ym) 외에, 기존 경로도 자동 감지해 체크한다:
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

  const ym = new URL(req.url).searchParams.get('ym') ?? '';
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return NextResponse.json({ error: '월(ym)을 YYYY-MM 형식으로 주세요.' }, { status: 400 });
  }
  const [y, m] = ym.split('-').map(Number);
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  // 슬롯별 수집: 업로드 건수·시각·경로 + 기간 구간들
  const acc: Record<
    string,
    { count: number; at: string | null; via: 'slot' | 'auto' | null; intervals: DayInterval[]; periodless: boolean }
  > = {};
  for (const s of UPLOAD_SLOTS) acc[s.key] = { count: 0, at: null, via: null, intervals: [], periodless: false };
  const add = (key: string, u: { row_count?: unknown; uploaded_at?: unknown; period_start?: unknown; period_end?: unknown }, via: 'slot' | 'auto') => {
    const a = acc[key];
    if (!a) return;
    a.count += Number(u.row_count ?? 0);
    a.at = String(u.uploaded_at ?? a.at ?? '');
    a.via = a.via ?? via;
    if (u.period_start && u.period_end) a.intervals.push({ start: String(u.period_start), end: String(u.period_end) });
    else a.periodless = true; // 구버전 기록(기간 없음) — 커버리지 판정 불가 → 완전으로 간주
  };

  // 1) 이 보드에서 올린 업로드
  const { data: slotRows, error: slotErr } = await supabase
    .schema('finance')
    .from('uploads')
    .select('slot,row_count,uploaded_at,period_start,period_end')
    .eq('slot_ym', ym)
    .not('slot', 'is', null)
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
    .select('bank,source,row_count,uploaded_at,period_start,period_end')
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

  // 3) 네이버 — launchd 자동수집 거래가 이 달에 있으면 완료(매일 수집 = 월 전체)
  if (acc.naverpay.count === 0 && acc.naverpay.intervals.length === 0 && !acc.naverpay.periodless) {
    const { count } = await supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('bank', 'naverpay')
      .eq('ym', ym);
    if ((count ?? 0) > 0) {
      acc.naverpay.count = count ?? 0;
      acc.naverpay.via = 'auto';
      acc.naverpay.intervals.push({ start: monthStart, end: monthEnd });
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

  return NextResponse.json({ ym, slots });
}
