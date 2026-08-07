import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyIssue } from '@/lib/garden/review-issue';
import { logActivity } from '@/lib/finance/activity';
import { checkAiQuota } from '@/lib/access/rate-limit';
import { notifyGardenEvent } from '@/lib/notify';
import { topicEmails } from '@/lib/garden-notify-topics-server';

const ACTION = '리뷰 AI 분류';

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
  // UI 가 remaining=0 이 될 때까지 반복 호출하는 배치라 상한을 넉넉히 둔다
  const over = await checkAiQuota(supabase, user, ACTION, 300);
  if (over) return over;

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
    .select('id, store_key, rating, content, keywords')
    .is('issue', null)
    .order('reviewed_at', { ascending: false })
    .limit(LLM_BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let classified = photoOnly?.length ?? 0;
  const issueFound: { store_key: string; rating: number | null; note: string | null; categories: string[] }[] = [];
  for (const r of targets ?? []) {
    const result = await classifyIssue(r, key);
    if (!result) continue; // 실패 — 미분류로 남겨 다음 호출에서 재시도
    const { error: upErr } = await db
      .from('place_reviews')
      .update({ issue: result.issue, issue_note: result.note, issue_categories: result.categories })
      .eq('id', r.id);
    if (!upErr) {
      classified++;
      if (result.issue) issueFound.push({ store_key: r.store_key, rating: r.rating, note: result.note, categories: result.categories });
    }
  }

  // 백필에서 새로 이슈로 판정된 리뷰도 담당자 알림 — 수집 시점에 초안 실패 등으로
  // 알림을 못 받았던 리뷰가 조용히 지나가지 않게 한다. 실패해도 분류 결과는 유지.
  if (issueFound.length > 0) {
    try {
      const storeLabel: Record<string, string> = { yangjae: '양재천점', pangyo: '판교점' };
      const lines = issueFound.map((i) => {
        const cats = i.categories.length ? ` (${i.categories.join(', ')})` : '';
        return `[${storeLabel[i.store_key] ?? i.store_key}] ★${i.rating ?? '-'} ${i.note ?? '지적 내용 확인 필요'}${cats}`;
      });
      const emails = await topicEmails(supabase, 'reviewIssue');
      await notifyGardenEvent(supabase, {
        emails,
        subject: `[이슈 리뷰] 분류에서 발견 ${issueFound.length}건 — ${lines[0].slice(0, 60)}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>분류 실행에서 불만·개선 지적 리뷰 ${issueFound.length}건이 확인됐어요.</strong></p>
          ${lines.map((l) => `<p>${l}</p>`).join('')}
          <p><a href="https://team-at-apps.vercel.app/garden/reviews">이슈·개선 탭 열기 →</a></p>
        </div>`,
        push: { title: `이슈 리뷰 ${issueFound.length}건 (분류)`, body: lines[0].slice(0, 100), url: '/garden/reviews' },
      });
    } catch (e) {
      console.error('이슈 분류 알림 실패:', e);
    }
  }

  // 카테고리 보완 — 카테고리 도입 전에 이슈로 분류된 리뷰. 남은 LLM 예산만큼만.
  const catBudget = LLM_BATCH - (targets?.length ?? 0);
  if (catBudget > 0) {
    // null만 대상 — 빈 배열([])은 '해당 카테고리 없음'으로 확정된 상태라 다시 묻지 않는다.
    // 수동 정정(manual)은 제외 — LLM이 이슈 아님으로 보고 카테고리를 비워버리면
    // 매니저의 판정이 카테고리 필터에서 사라지는 셈이라, 수동 건은 건드리지 않는다.
    const { data: catTargets } = await db
      .from('place_reviews')
      .select('id, rating, content, keywords, issue_note')
      .eq('issue', true)
      .is('issue_categories', null)
      .is('issue_source', null)
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
    // 수동 정정 건은 카테고리 보완 대상이 아니므로 잔여 카운트에서도 제외 (무한 버튼 방지)
    db.from('place_reviews').select('id', { count: 'exact', head: true })
      .eq('issue', true).is('issue_categories', null).is('issue_source', null).not('content', 'is', null),
  ]);

  // 사용량 상한이 이 로그 건수를 세므로 호출마다 남긴다
  await logActivity(supabase, user, ACTION, `${classified}건 분류`);
  return NextResponse.json({ classified, remaining: (nullCount ?? 0) + (catCount ?? 0) });
}
