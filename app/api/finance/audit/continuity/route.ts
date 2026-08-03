import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { getBrandBanks, KNOWN_BANKS } from '@/lib/finance/brandBanks';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 전체 기간 잔액 연속성 감사 — DB에 저장된 은행 거래 전체로 잔액 체인
// (이전 잔액 + 입금 − 출금 = 현재 잔액)을 검사한다. 업로드 시점의 파일 단위 검사가
// 못 잡는 '파일 하나 통째 누락'(예: 3~4월 파일을 안 올림)을 잡는 마지막 관문.
// 잔액 미기재(0) 행은 체인 리셋(파일 단위 검사와 동일 규칙).

interface Break {
  from: string; // 이전 거래일 (YYYY-MM-DD)
  to: string; // 다음 거래일
  expected: number;
  actual: number;
}

const PAGE = 1000;

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

  const brandRaw = new URL(req.url).searchParams.get('brand');
  const brand = brandRaw && ['garden', 'staffmeal'].includes(brandRaw) ? brandRaw : null;
  if (!brand) return NextResponse.json({ error: '브랜드(garden|staffmeal)를 지정하세요.' }, { status: 400 });

  const banks = await getBrandBanks(supabase, brand);
  const results: {
    bank: string;
    label: string;
    rows: number;
    checked: number;
    breaks: Break[];
    reliable: boolean;
  }[] = [];

  for (const bank of banks) {
    // 전 행 페이지 수집 — 잔액 체인은 시간순이 생명이라 tx_at, id로 고정 정렬
    const all: { tx_at: string; amount_in: number; amount_out: number; balance: number }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .schema('finance')
        .from('transactions')
        .select('tx_at,amount_in,amount_out,balance')
        .eq('brand', brand)
        .eq('bank', bank)
        .eq('source', 'bank')
        .order('tx_at')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      all.push(...((data ?? []) as typeof all));
      if (!data || data.length < PAGE) break;
    }

    let prev: (typeof all)[number] | null = null;
    let checked = 0;
    const breaks: Break[] = [];
    for (const cur of all) {
      if (Number(cur.balance) === 0) {
        prev = null; // 잔액 미기재 행 — 판정 불가, 체인 리셋
        continue;
      }
      if (prev) {
        checked++;
        const expected = Number(prev.balance) + Number(cur.amount_in) - Number(cur.amount_out);
        if (Math.abs(expected - Number(cur.balance)) > 0.5 && breaks.length < 100) {
          breaks.push({
            from: String(prev.tx_at).slice(0, 10),
            to: String(cur.tx_at).slice(0, 10),
            expected,
            actual: Number(cur.balance),
          });
        }
      }
      prev = cur;
    }
    results.push({
      bank,
      label: KNOWN_BANKS.find((b) => b.value === bank)?.label ?? bank,
      rows: all.length,
      checked,
      breaks,
      // 끊긴 곳이 아주 많으면(같은 시각 다건 정렬 뒤섞임 등) 판정 불가로 표시
      reliable: !(breaks.length >= 5 && checked > 0 && breaks.length / checked > 0.5),
    });
  }

  return NextResponse.json({ brand, results });
}
