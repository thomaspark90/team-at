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
//
// 체인은 행이 아니라 **동시각(분 단위) 묶음** 단위 — 은행 파일이 오름차순·내림차순으로 섞여
// 들어와 같은 시각 거래들의 DB 저장 순서를 믿을 수 없다(2026-08-20, 스탭밀 신규 파일에서
// 행 단위 검사가 가짜 끊김 100건+를 내던 문제). 묶음의 순유입을 더한 기대 잔액이 묶음 안
// 어느 행의 잔액과도 안 맞으면 그때가 진짜 끊김이다. 검증 기점(앵커)은 시각이 유일한 행.

interface Break {
  from: string; // 이전 거래일 (YYYY-MM-DD)
  to: string; // 다음 거래일
  expected: number;
  actual: number;
}

// ⚠️ 프로젝트 Max Rows(Settings→API, 2026-08-09 기준 20000) 이하로 유지 — 넘으면 응답이 조용히 잘린다.
const PAGE = 20000;

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

    // 동시각 묶음으로 접기 — tx_at 정렬은 신뢰하되 같은 시각 안의 순서는 쓰지 않는다
    interface Group {
      txAt: string;
      net: number; // Σ(입금 − 출금)
      balances: number[]; // 묶음 안 각 행의 잔액
      hasZero: boolean; // 잔액 미기재(0) 행 포함 — 이 묶음을 가로지르는 검사는 불가
    }
    const groups: Group[] = [];
    for (const cur of all) {
      const txAt = String(cur.tx_at);
      let g = groups[groups.length - 1];
      if (!g || g.txAt !== txAt) {
        g = { txAt, net: 0, balances: [], hasZero: false };
        groups.push(g);
      }
      g.net += Number(cur.amount_in) - Number(cur.amount_out);
      if (Number(cur.balance) === 0) g.hasZero = true;
      else g.balances.push(Number(cur.balance));
    }

    let checked = 0;
    const breaks: Break[] = [];
    let end: number | null = null; // 직전 묶음까지 검증된 잔액
    let endAt = ''; // 그 시각 — 끊김의 from 표기용
    for (const g of groups) {
      if (g.hasZero) {
        end = null; // 미기재 행이 섞인 묶음 — 판정 불가, 체인 리셋
        continue;
      }
      if (end == null) {
        // 앵커 재설정 — 시각이 유일한(1행) 묶음만 잔액이 확정적이다
        if (g.balances.length === 1) {
          end = g.balances[0];
          endAt = g.txAt;
        }
        continue;
      }
      checked++;
      const expected = end + g.net;
      // 묶음의 시간순 마지막 행 잔액 = 기대값이어야 한다. 순서를 모르니 '어느 행이 마지막인지'
      // 대신 '기대값이 묶음 안에 존재하는지'로 판정(1행 묶음이면 기존 행 단위 검사와 동일).
      const match = g.balances.some((b) => Math.abs(b - expected) <= 0.5);
      if (match) {
        end = expected;
        endAt = g.txAt;
      } else {
        if (breaks.length < 100) {
          // actual = 기대값에 가장 가까운 잔액 — 차액이 곧 누락된 거래 규모의 힌트
          const nearest = g.balances.reduce((a, b) => (Math.abs(b - expected) < Math.abs(a - expected) ? b : a));
          breaks.push({ from: endAt.slice(0, 10), to: g.txAt.slice(0, 10), expected, actual: nearest });
        }
        // 재동기화 — 1행 묶음이면 그 잔액으로, 다행 묶음이면 다음 앵커까지 보류
        if (g.balances.length === 1) {
          end = g.balances[0];
          endAt = g.txAt;
        } else {
          end = null;
        }
      }
    }
    results.push({
      bank,
      label: KNOWN_BANKS.find((b) => b.value === bank)?.label ?? bank,
      rows: all.length,
      checked,
      breaks,
      // 끊긴 곳이 아주 많으면(계좌 혼합 등 데이터 자체 문제) 판정 불가로 표시
      reliable: !(breaks.length >= 5 && checked > 0 && breaks.length / checked > 0.5),
    });
  }

  return NextResponse.json({ brand, results });
}
