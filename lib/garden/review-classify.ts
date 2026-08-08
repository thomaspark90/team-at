import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_URL } from '@/lib/app-url';
import { classifyIssue } from '@/lib/garden/review-issue';
import { notifyGardenEvent } from '@/lib/notify';
import { reviewIssueEmails } from '@/lib/garden-notify-topics-server';
import { STORES } from '@/lib/types';

// 리뷰 이슈 분류 백필 한 배치 — 이슈 탭의 '분류 실행' 버튼과 일일 크론이 공유한다.
//   - 본문 없는(사진만) 리뷰는 LLM 없이 issue=false 로 확정
//   - 본문 있는 리뷰는 호출당 최대 LLM_BATCH 건만 분류 (함수 시간 제한 안에 끝나도록)
//   - 카테고리 보완은 카테고리·요약만 채우고 issue 판정 자체는 바꾸지 않는다(수동 정정 보호)
//   - 새로 이슈로 판정된 건은 지점 담당자에게 이메일+푸시

const LLM_BATCH = 10;

// .from()만 쓰므로 구조적 타입으로 받는다 — 세션 클라이언트의 .schema('finance') 결과(PostgrestClient)와
// finance 스코프 service 클라이언트를 모두 수용하기 위함
type FinanceDb = { from: (table: string) => any };

export async function classifyBacklog(
  db: FinanceDb, // finance 스코프 클라이언트
  notifyClient: SupabaseClient, // 기본(public) 스코프 — 알림 수신자 조회·발송용
  key: string, // GEMINI_API_KEY
): Promise<{ classified: number; remaining: number; error?: string }> {
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
  if (error) return { classified: 0, remaining: 0, error: error.message };

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
  // 지점별로 나눠 발송 — 각 지점 이슈는 그 지점 담당자에게만 간다(2026-08-08).
  if (issueFound.length > 0) {
    try {
      const storeLabel = Object.fromEntries(STORES.map((s) => [s.id, s.label]));
      const byStore = new Map<string, typeof issueFound>();
      for (const i of issueFound) {
        if (!byStore.has(i.store_key)) byStore.set(i.store_key, []);
        byStore.get(i.store_key)!.push(i);
      }
      for (const [storeKey, items] of Array.from(byStore.entries())) {
        const label = storeLabel[storeKey] ?? storeKey;
        const lines = items.map((i) => {
          const cats = i.categories.length ? ` (${i.categories.join(', ')})` : '';
          return `★${i.rating ?? '-'} ${i.note ?? '지적 내용 확인 필요'}${cats}`;
        });
        const emails = await reviewIssueEmails(notifyClient, storeKey);
        await notifyGardenEvent(notifyClient, {
          emails,
          subject: `[이슈 리뷰] ${label} 분류에서 발견 ${items.length}건 — ${lines[0].slice(0, 60)}`,
          html: `
          <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
            <p><strong>분류 실행에서 ${label}의 불만·개선 지적 리뷰 ${items.length}건이 확인됐어요.</strong></p>
            ${lines.map((l) => `<p>${l}</p>`).join('')}
            <p><a href="${APP_URL}/garden/reviews">이슈·개선 탭 열기 →</a></p>
          </div>`,
          push: { title: `${label} 이슈 리뷰 ${items.length}건 (분류)`, body: lines[0].slice(0, 100), url: '/garden/reviews' },
        });
      }
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

  return { classified, remaining: (nullCount ?? 0) + (catCount ?? 0) };
}
