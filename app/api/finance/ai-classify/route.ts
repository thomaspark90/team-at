import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Cat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
}

// 미분류(정규화 키 있는) 거래를 Gemini 로 분류 추천. 빈 내용은 개별이라 제외(수동).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY가 없어요. .env.local에 키를 추가하고 서버를 재시작해주세요.' },
      { status: 400 }
    );
  }

  const { data: txns } = await supabase
    .schema('finance')
    .from('transactions')
    .select('normalized_key,memo,amount_in,amount_out')
    .is('category_id', null);

  // 정규화 키 그룹 (빈 키 제외)
  const groupMap = new Map<string, { memo: string; inflow: boolean; count: number }>();
  for (const t of txns ?? []) {
    if (!t.normalized_key) continue;
    const g = groupMap.get(t.normalized_key);
    if (g) g.count++;
    else groupMap.set(t.normalized_key, { memo: t.memo, inflow: t.amount_in >= t.amount_out, count: 1 });
  }
  const groups = Array.from(groupMap.entries()).map(([key, v]) => ({ key, ...v }));
  if (groups.length === 0) return NextResponse.json({ suggestions: [] });

  const { data: cats } = await supabase
    .schema('finance')
    .from('categories')
    .select('id,type,name,parent_id')
    .eq('active', true);
  const catList = (cats as Cat[] | null ?? [])
    .map((c) => {
      const p = (cats as Cat[]).find((x) => x.id === c.parent_id);
      return `${c.id}: [${c.type}] ${p ? p.name + ' > ' : ''}${c.name}`;
    })
    .join('\n');

  const prompt = `너는 한국 카페의 회계 분류 도우미다. 아래 계정과목과 은행 거래내용을 보고 각 거래를 가장 알맞은 계정과목 id로 분류하라.
분류 원칙:
- 입금(inflow)은 매출(revenue)·영업외수익 계열, 출금은 지출(cogs 재료비/sga 판관비)·영업외비용 계열.
- 카드사·페이 정산 입금 = 매출. 사람 이름만 있는 반복 출금 = 인건비 계열. 전력/가스/수도 = 수도광열비.
- 확신이 낮으면 confidence를 0.5 미만으로 정직하게 낮춰라.

[계정과목 id 목록]
${catList}

[분류할 거래]
${groups.map((g, i) => `${i}. 내용="${g.memo}" ${g.inflow ? '입금' : '출금'} ${g.count}건`).join('\n')}`;

  let gj: unknown;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  index: { type: 'INTEGER' },
                  categoryId: { type: 'INTEGER' },
                  confidence: { type: 'NUMBER' },
                  reason: { type: 'STRING' },
                },
                required: ['index', 'categoryId', 'confidence'],
              },
            },
          },
        }),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Gemini 오류: ${t.slice(0, 200)}` }, { status: 500 });
    }
    gj = await res.json();
  } catch (e) {
    return NextResponse.json({ error: `Gemini 호출 실패: ${(e as Error).message}` }, { status: 500 });
  }

  const text =
    (gj as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts?.[0]
      ?.text ?? '[]';
  let parsed: { index: number; categoryId: number; confidence: number; reason?: string }[];
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'AI 응답을 해석하지 못했어요.' }, { status: 500 });
  }

  const validIds = new Set((cats as Cat[] | null ?? []).map((c) => c.id));
  const suggestions = parsed
    .map((p) => ({
      key: groups[p.index]?.key,
      categoryId: p.categoryId,
      confidence: p.confidence,
      reason: p.reason ?? '',
    }))
    .filter((s) => s.key && validIds.has(s.categoryId));

  return NextResponse.json({ suggestions });
}
