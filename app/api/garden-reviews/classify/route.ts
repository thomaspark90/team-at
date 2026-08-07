import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyIssue } from '@/lib/garden/review-issue';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 기존 리뷰 이슈 분류 백필 (로그인 세션 인증).
// POST: 미분류(issue is null) 리뷰와, 이슈인데 카테고리가 비어 있는 리뷰를 배치로 처리한다.
//   - 본문 없는(사진만) 리뷰는 LLM 없이 issue=false 로 확정
//   - 본문 있는 리뷰는 호출당 최대 LLM_BATCH 건만 분류 (maxDuration 30초 안에 끝나도록)
//   - 카테고리 보완은 카테고리·요약만 채우고 issue 판정 자체는 바꾸지 않는다(수동 정정 보호)
// UI(이슈·개선 탭)의 '분류 실행' 버튼이 remaining=0 이 될 때까지 반복 호출한다.

const LLM_BATCH = 10;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 });

  const db = supabase.schema('finance');

  // 사진만 있는 리뷰 — 지적할 본문이 없으므로 일괄 issue=false
  const { data: photoOnly } = await db
    .from('place_reviews')
    .select('id')
    .is('issue', null)
    .or('content.is.null,content.eq.')
    .limit(200);
  if (photoOnly?.length) {
    await db.from('place_reviews')
      .update({ issue: false, issue_note: null })
      .in('id', photoOnly.map((r: { id: number }) => r.id));
  }

  // 본문 있는 미분류 리뷰를 배치 분류
  const { data: targets, error } = await db
    .from('place_reviews')
    .select('id, rating, content, keywords')
    .is('issue', null)
    .order('reviewed_at', { ascending: false })
    .limit(LLM_BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let classified = photoOnly?.length ?? 0;
  for (const r of targets ?? []) {
    const result = await classifyIssue(r, key);
    if (!result) continue; // 실패 — 미분류로 남겨 다음 호출에서 재시도
    const { error: upErr } = await db
      .from('place_reviews')
      .update({ issue: result.issue, issue_note: result.note, issue_categories: result.categories })
      .eq('id', r.id);
    if (!upErr) classified++;
  }

  // 카테고리 보완 — 카테고리 도입 전에 이슈로 분류된 리뷰. 남은 LLM 예산만큼만.
  const catBudget = LLM_BATCH - (targets?.length ?? 0);
  if (catBudget > 0) {
    // null만 대상 — 빈 배열([])은 '해당 카테고리 없음'으로 확정된 상태라 다시 묻지 않는다
    const { data: catTargets } = await db
      .from('place_reviews')
      .select('id, rating, content, keywords, issue_note')
      .eq('issue', true)
      .is('issue_categories', null)
      .not('content', 'is', null)
      .order('reviewed_at', { ascending: false })
      .limit(catBudget);
    for (const r of catTargets ?? []) {
      const result = await classifyIssue(r, key);
      if (!result) continue; // 실패 — null로 남겨 다음 호출에서 재시도
      const { error: upErr } = await db
        .from('place_reviews')
        .update({
          issue_categories: result.categories,
          ...(r.issue_note ? {} : { issue_note: result.note }),
        })
        .eq('id', r.id);
      if (!upErr) classified++;
    }
  }

  const [{ count: nullCount }, { count: catCount }] = await Promise.all([
    db.from('place_reviews').select('id', { count: 'exact', head: true }).is('issue', null),
    db.from('place_reviews').select('id', { count: 'exact', head: true })
      .eq('issue', true).is('issue_categories', null).not('content', 'is', null),
  ]);

  return NextResponse.json({ classified, remaining: (nullCount ?? 0) + (catCount ?? 0) });
}
