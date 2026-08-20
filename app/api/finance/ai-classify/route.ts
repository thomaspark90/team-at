import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Cat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
}

// 그룹이 많으면(2025 소급 등) 한 번에 보내다 잘리므로 청크로 나눠 호출하고,
// 무료 한도(429)에 걸리면 excel 열매핑과 같은 순서로 모델을 폴백한다.
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];
const CHUNK = 80; // 청크당 그룹 수 — 프롬프트·응답 길이 안전 범위

interface Parsed {
  index: number;
  categoryId: number;
  confidence: number;
  reason?: string;
}

async function suggestChunk(
  groups: { key: string; memo: string; inflow: boolean; count: number }[],
  catList: string,
  examples: string,
  apiKey: string
): Promise<Parsed[]> {
  const prompt = `너는 한국 카페의 회계 분류 도우미다. 아래 계정과목과 은행 거래내용을 보고 각 거래를 가장 알맞은 계정과목 id로 분류하라.
분류 원칙:
- 입금(inflow)은 매출(revenue)·영업외수익 계열, 출금은 지출(cogs 재료비/sga 판관비)·영업외비용 계열.
- 카드사·페이 정산 입금 = 매출. 사람 이름만 있는 반복 출금 = 인건비 계열. 전력/가스/수도 = 수도광열비.
- 확신이 낮으면 confidence를 0.5 미만으로 정직하게 낮춰라.
${examples ? `- 아래 '기존 분류 예시'는 이 가게가 실제로 확정한 분류다(가맹점 규칙 + 실거래 내용). 유사한 가맹점·품목은 이 스타일을 최우선으로 따라라.\n\n[기존 분류 예시 — 가맹점/실거래 내용 → 계정]\n${examples}\n` : ''}
[계정과목 id 목록]
${catList}

[분류할 거래]
${groups.map((g, i) => `${i}. 내용="${g.memo}" ${g.inflow ? '입금' : '출금'} ${g.count}건`).join('\n')}`;

  const body = JSON.stringify({
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
  });

  let lastError = '';
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    );
    if (res.status === 429 || res.status === 503) {
      lastError = `${model}: ${res.status}`;
      continue;
    }
    if (!res.ok) throw new Error(`Gemini 오류(${res.status}): ${(await res.text()).slice(0, 200)}`);
    const gj = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = gj.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastError = `${model}: 빈 응답`;
      continue;
    }
    return JSON.parse(text) as Parsed[];
  }
  throw new Error(`AI 사용량 한도에 걸렸어요. 잠시 후 다시 시도해주세요. (${lastError})`);
}

// 미분류(정규화 키 있는) 거래를 Gemini 로 분류 추천. 빈 내용은 개별이라 제외(수동).
// body.brand 지정 시 그 브랜드의 미분류만 — 분류 화면의 브랜드 스코프와 일치시킨다.
export async function POST(req: Request) {
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

  const reqBody = (await req.json().catch(() => ({}))) as { brand?: string; ym?: string };
  const brand =
    reqBody.brand && ['garden', 'staffmeal', 'personal'].includes(reqBody.brand) ? reqBody.brand : null;
  // 현재 보는 스코프만 처리 — 전 기간 미분류를 한 번에 돌리면 그룹이 많아 60초 타임아웃(2026-08-03).
  // 'YYYY-MM'(월) 또는 'YYYY'(연도 전체 — 사이드바 연도 선택, 2026-08-20)를 받는다.
  const ym = typeof reqBody.ym === 'string' && /^\d{4}(-\d{2})?$/.test(reqBody.ym) ? reqBody.ym : null;

  let txQ = supabase
    .schema('finance')
    .from('transactions')
    .select('normalized_key,memo,amount_in,amount_out')
    .is('category_id', null);
  if (brand) txQ = txQ.eq('brand', brand);
  if (ym && /^\d{4}-\d{2}$/.test(ym)) txQ = txQ.eq('ym', ym);
  else if (ym) txQ = txQ.gte('ym', `${ym}-01`).lte('ym', `${ym}-12`);
  const { data: txns } = await txQ;

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
  const catLabel = (id: number) => {
    const c = (cats as Cat[] | null ?? []).find((x) => x.id === id);
    if (!c) return null;
    const p = (cats as Cat[]).find((x) => x.id === c.parent_id);
    return `[${c.type}] ${p ? p.name + ' > ' : ''}${c.name}`;
  };
  // '미상'(용도 불명 보류함)은 AI가 배우거나 추천하면 안 되는 계정 — 목록·예시에서 제외
  const catList = (cats as Cat[] | null ?? [])
    .filter((c) => !c.name.includes('미상'))
    .map((c) => `${c.id}: ${catLabel(c.id)}`)
    .join('\n');

  // ---- few-shot 예시 풀 — 규칙 전체 + 최근 분류 실거래(2026-08-03 업그레이드) ----
  // 예시가 정확도를 좌우한다: ①규칙(가맹점→계정) 전체(캡 2,000 — Gemini 컨텍스트 여유)
  // ②최근 분류된 실거래 메모 원문(카테고리별 균형 ~300건) — 같은 판매자가 잡화를 섞어 파는
  // 쿠팡·네이버 품목 추론에 실거래 문장이 결정적. 브랜드 스코프가 있으면 그 브랜드 것만.
  interface Example {
    text: string;
    label: string;
    tokens: Set<string>;
  }
  const tokenize = (s: string) => {
    const t = new Set<string>();
    for (const w of s.toLowerCase().split(/[^0-9a-z가-힣]+/)) {
      if (w.length >= 2 && !/^\d+$/.test(w)) t.add(w);
    }
    return t;
  };

  let rulesQ = supabase.schema('finance').from('rules').select('normalized_key,category_id').limit(2000);
  if (brand) rulesQ = rulesQ.eq('brand', brand);
  let txExQ = supabase
    .schema('finance')
    .from('transactions')
    .select('memo,category_id')
    .not('category_id', 'is', null)
    .order('classified_at', { ascending: false, nullsFirst: false })
    .limit(800);
  if (brand) txExQ = txExQ.eq('brand', brand);
  const [{ data: ruleRows }, { data: txExRows }] = await Promise.all([rulesQ, txExQ]);

  const pool: Example[] = [];
  const seenText = new Set<string>();
  const pushEx = (text: string, categoryId: number) => {
    const label = catLabel(categoryId);
    const t = text.trim().slice(0, 80);
    if (!label || label.includes('미상') || !t || seenText.has(t)) return;
    seenText.add(t);
    pool.push({ text: t, label, tokens: tokenize(t) });
  };
  for (const r of (ruleRows as { normalized_key: string; category_id: number }[] | null) ?? []) {
    pushEx(r.normalized_key, r.category_id);
  }
  // 실거래는 카테고리별 최대 15건씩 균형 추출(특정 계정 편중 방지), 총 300건 캡
  const perCat = new Map<number, number>();
  let txExCount = 0;
  for (const r of (txExRows as { memo: string; category_id: number }[] | null) ?? []) {
    if (txExCount >= 300) break;
    const n = perCat.get(r.category_id) ?? 0;
    if (n >= 15) continue;
    const before = pool.length;
    pushEx(r.memo, r.category_id);
    if (pool.length > before) {
      perCat.set(r.category_id, n + 1);
      txExCount++;
    }
  }

  // 청크별 관련 예시 선별(RAG-lite) — 풀이 작으면 전부, 크면 '기본 스타일 예시 + 각 거래와
  // 토큰이 겹치는 상위 예시'만 골라 프롬프트를 관련 예시로 압축(규칙 수천 개로 커져도 유지).
  const selectExamples = (chunk: { key: string; memo: string }[], cap = 250): Example[] => {
    if (pool.length <= 300) return pool;
    const picked = new Map<string, Example>();
    for (const ex of pool.slice(0, 80)) picked.set(ex.text, ex); // 기본 스타일(규칙 앞쪽)
    for (const g of chunk) {
      if (picked.size >= cap) break;
      const gt = tokenize(`${g.memo} ${g.key}`);
      const scored: [number, Example][] = [];
      for (const ex of pool) {
        let s = 0;
        for (const t of Array.from(gt)) if (ex.tokens.has(t)) s++;
        if (s > 0) scored.push([s, ex]);
      }
      scored.sort((a, b) => b[0] - a[0]);
      for (const [, ex] of scored.slice(0, 3)) picked.set(ex.text, ex);
    }
    return Array.from(picked.values()).slice(0, cap);
  };

  // 청크 단위로 나눠 호출 — 일부 청크가 실패해도 나머지 추천은 살려서 부분 반환
  const validIds = new Set((cats as Cat[] | null ?? []).map((c) => c.id));
  const suggestions: { key: string; categoryId: number; confidence: number; reason: string }[] = [];
  let failedChunks = 0;
  let lastError = '';
  for (let i = 0; i < groups.length; i += CHUNK) {
    const chunk = groups.slice(i, i + CHUNK);
    try {
      const exStr = selectExamples(chunk)
        .map((ex) => `${ex.text} → ${ex.label}`)
        .join('\n');
      const parsed = await suggestChunk(chunk, catList, exStr, key);
      for (const p of parsed) {
        const g = chunk[p.index];
        if (g && validIds.has(p.categoryId)) {
          suggestions.push({ key: g.key, categoryId: p.categoryId, confidence: p.confidence, reason: p.reason ?? '' });
        }
      }
    } catch (e) {
      failedChunks++;
      lastError = (e as Error).message;
    }
  }
  if (suggestions.length === 0 && failedChunks > 0) {
    return NextResponse.json({ error: lastError || 'AI 추천에 실패했어요.' }, { status: 500 });
  }

  await logActivity(
    supabase,
    user,
    'AI 분류 추천 실행',
    `${brand ? `[${brand}] ` : ''}${suggestions.length}건 추천 (그룹 ${groups.length}개${failedChunks ? ` · 실패 청크 ${failedChunks}` : ''})`
  );
  return NextResponse.json({ suggestions, failedChunks });
}
