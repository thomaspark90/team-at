import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isOwner, resolveRole } from '@/lib/finance/access';
import { readGardenTopics } from '@/lib/garden-notify-topics-server';
import { purchaseRecords, grindMeasurementRecords } from '@/lib/blob-records';
import { normalize } from '@/lib/pricing';
import { STORES } from '@/lib/types';
import type { DripRecipe } from '@/lib/types';
import type { GardenTodo } from '@/lib/garden-todos';
import type { CalibrationCheck } from '@/lib/calibration-checks';
import { periodOf } from '@/lib/calibration-checks';
import { fitDialToMicron } from '@/lib/grinder-calibration';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import type { BoardCard } from '@/lib/garden/board';
import { TYPE_TAB, daysAgo, shortDate, stepsAt, kstDay } from '@/lib/garden/board';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 작업 보드 — 여러 소스를 서버에서 한 번에 취합해 카드로 돌려준다.
// 화면마다 따로 부르면 blob 왕복이 배로 늘어나므로 이 라우트 하나로 모은다.
//
// 권한 연동: 미들웨어가 팀 계정·가든 섹션까지 확인한 뒤 들어온다. 여기서는 사용자의
// 가든 탭 권한으로 카드 종류를 한 번 더 거른다 — 열 수 없는 화면의 카드를 보여주면
// 눌러도 튕기기 때문이다. 송금 카드는 재무 역할이 있는 사람에게만 보낸다.

const readJson = async <T,>(path: string): Promise<T | null> => {
  const res = await get(path, { access: 'private', useCache: false });
  if (!res) return null;
  try {
    return JSON.parse(await new Response(res.stream).text()) as T;
  } catch {
    return null;
  }
};

const PROTOCOL_DIALS = [6, 8, 10];
const SHOTS_PER_DIAL = 3;
const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.label ?? id;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const me = (user.email ?? '').toLowerCase();
  const [topics, access, role] = await Promise.all([
    readGardenTopics(),
    supabase
      .schema('finance')
      .from('garden_tab_access')
      .select('tabs, sections')
      .eq('user_id', user.id)
      .maybeSingle()
      .then((r) => r.data),
    resolveRole(supabase, user),
  ]);
  const allowedTabs = isOwner(user.email) ? null : ((access?.tabs as string[] | null) ?? null);
  const isFinance = ['admin', 'classifier'].includes(role ?? '');

  const cards: BoardCard[] = [];
  // 담당자 판정 — 토픽에 지정된 사람. 비어 있으면 '누구나'(모두에게 내 차례로 보이지 않음)
  const owns = (emails: string[]) => emails.map((e) => e.toLowerCase()).includes(me);

  const [purchases, recipesStore, measurements, checksStore, todosStore, profiles] = await Promise.all([
    purchaseRecords.readAll().catch(() => []),
    readJson<{ recipes: DripRecipe[] }>('data/garden-recipes.json'),
    grindMeasurementRecords.readAll().catch(() => []),
    readJson<{ checks: CalibrationCheck[] }>('data/garden-calibration-checks.json'),
    readJson<{ todos: GardenTodo[] }>('data/garden-todos.json'),
    readJson<{ profiles: GrinderProfiles }>('data/garden-grinders.json'),
  ]);

  // ── 발주 → 판매 준비 : 발주 · 레시피 · 원두카드 ──
  const recipes = recipesStore?.recipes ?? [];
  const recipeKeys = new Set(recipes.map((r) => r.beanKey));
  const latestByBean = new Map<string, (typeof purchases)[number]>();
  for (const p of purchases) {
    const k = normalize(p.bean);
    const cur = latestByBean.get(k);
    if (!cur || p.createdAt.localeCompare(cur.createdAt) > 0) latestByBean.set(k, p);
  }
  const recipeOwners = topics.recipeNew ?? [];
  for (const [key, p] of Array.from(latestByBean.entries())) {
    const hasRecipe = recipeKeys.has(key);
    const d = daysAgo(p.createdAt);
    cards.push({
      id: `order:${p.id}`,
      type: 'order',
      title: p.bean,
      column: hasRecipe ? 'done' : 'todo',
      steps: stepsAt(['발주', '레시피', '원두카드'], hasRecipe ? 2 : 1),
      meta: [
        { text: `${shortDate(p.createdAt)} 발주` },
        ...(p.chosenPrice != null ? [{ text: `${p.chosenPrice.toLocaleString()}원` }] : []),
        ...(!hasRecipe && d >= 3 ? [{ text: `${d}일째 대기`, tone: 'late' as const }] : []),
      ],
      assignees: recipeOwners,
      mine: !hasRecipe && owns(recipeOwners),
      mineReason: '레시피 담당',
      href: '/garden/recipes',
      actionLabel: hasRecipe ? '레시피 보기' : '레시피 설정',
      tab: TYPE_TAB.order,
      sortAt: p.createdAt,
    });
  }

  // ── 분쇄도 측정 : 요청 · 업로드 · 환산 적용 ──
  const calOwners = topics.calibration ?? [];
  const today = kstDay(new Date().toISOString());
  for (const s of STORES) {
    const mine = measurements.filter((m) => m.store === s.id);
    const todayShots = mine.filter(
      (m) => kstDay(m.createdAt) === today && PROTOCOL_DIALS.includes(Math.round(m.dial * 10) / 10)
    );
    const total = PROTOCOL_DIALS.length * SHOTS_PER_DIAL;
    const done = Math.min(todayShots.length, total);
    const applied = !!fitDialToMicron(profiles?.profiles?.[s.id]?.points);
    // 오늘 아무것도 안 올렸고 이미 환산까지 적용돼 있으면 할 일이 아니다
    if (done === 0 && applied) continue;
    const stage = done === 0 ? 0 : done < total ? 1 : applied ? 3 : 2;
    cards.push({
      id: `measure:${s.id}`,
      type: 'measure',
      title: `${s.label} 6/8/10 × 3샷 측정`,
      column: stage === 0 ? 'todo' : stage >= 3 ? 'done' : 'doing',
      steps: stepsAt(['요청', '업로드', '환산 적용'], Math.min(stage, 2)),
      meta: [
        { text: `${done}/${total}샷` },
        ...(applied ? [{ text: '환산 적용됨', tone: 'ok' as const }] : []),
      ],
      assignees: calOwners,
      mine: stage < 3 && owns(calOwners),
      mineReason: '캘리브레이션 담당',
      href: '/garden/calibration',
      actionLabel: done < total ? '측정 업로드' : '환산 적용',
      progress: done / total,
      tab: TYPE_TAB.measure,
      sortAt: todayShots[0]?.createdAt ?? new Date().toISOString(),
    });
  }

  // ── 드리프트 점검 : 이번 반월 카드 ──
  const checks = checksStore?.checks ?? [];
  const curPeriod = periodOf(new Date()).key;
  for (const c of checks) {
    if (c.period !== curPeriod && c.status === 'done') continue; // 지난 기간 완료분은 숨김
    const stage = c.status === 'todo' ? 0 : c.status === 'doing' ? 1 : 2;
    const overdue = c.period !== curPeriod && c.status !== 'done';
    cards.push({
      id: `check:${c.id}`,
      type: 'check',
      title: `${storeLabel(c.store)} EK43 · ${c.periodLabel}`,
      column: c.status === 'done' ? 'done' : c.status === 'doing' ? 'doing' : 'todo',
      steps: stepsAt(['측정', '기록', '판정'], stage),
      meta: [
        ...(overdue ? [{ text: `${c.periodLabel} 미완료 · 이월`, tone: 'late' as const }] : []),
        ...(c.memo ? [{ text: c.memo }] : []),
      ],
      assignees: calOwners,
      mine: c.status !== 'done' && owns(calOwners),
      mineReason: '캘리브레이션 담당',
      href: '/garden',
      actionLabel: c.status === 'todo' ? '진행' : '완료 처리',
      tab: TYPE_TAB.check,
      sortAt: c.updatedAt ?? `${c.period}-01`,
    });
  }

  // ── 네이버 리뷰 : 수집 · 초안 · 승인 · 등록 ──
  const reviewOwners = topics.reviewIssue ?? [];
  const { data: reviews } = await supabase
    .schema('finance')
    .from('place_reviews')
    .select('id, store_key, rating, issue_note, status, reviewed_at')
    .eq('issue', true)
    .in('status', ['new', 'drafted', 'approved'])
    .order('reviewed_at', { ascending: false })
    .limit(20);
  for (const r of reviews ?? []) {
    const stage = r.status === 'new' ? 1 : r.status === 'drafted' ? 2 : 3;
    cards.push({
      id: `review:${r.id}`,
      type: 'review',
      title: r.issue_note ?? '지적 내용 확인 필요',
      column: r.status === 'new' ? 'todo' : 'doing',
      steps: stepsAt(['수집', '초안', '승인', '등록'], stage),
      meta: [{ text: `${storeLabel(r.store_key)} ★${r.rating ?? '-'}` }, { text: shortDate(r.reviewed_at) }],
      assignees: reviewOwners,
      mine: owns(reviewOwners),
      mineReason: '이슈 리뷰 담당',
      href: '/garden/reviews',
      actionLabel: r.status === 'approved' ? '등록 확인' : '검수하기',
      tab: TYPE_TAB.review,
      sortAt: r.reviewed_at,
    });
  }

  // ── 송금 요청 : 요청 · 이체 (재무 담당에게만) ──
  if (isFinance) {
    const { data: transfers } = await supabase
      .schema('finance')
      .from('transfer_requests')
      .select('id, vendor_name, amount, requester_email, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20);
    for (const t of transfers ?? []) {
      const d = daysAgo(t.created_at);
      cards.push({
        id: `money:${t.id}`,
        type: 'money',
        title: `${t.vendor_name ?? '거래처'} — ${Number(t.amount ?? 0).toLocaleString()}원`,
        column: 'todo',
        steps: stepsAt(['요청', '이체'], 1),
        meta: [
          ...(d >= 2 ? [{ text: `${d}일 경과`, tone: 'late' as const }] : [{ text: shortDate(t.created_at) }]),
          { text: `요청: ${(t.requester_email ?? '').split('@')[0]}` },
        ],
        assignees: [],
        mine: true,
        mineReason: '재무 담당',
        href: '/dashboard/transfer',
        actionLabel: '이체 처리',
        tab: TYPE_TAB.money,
        sortAt: t.created_at,
      });
    }
  }

  // ── 투두 ──
  for (const t of todosStore?.todos ?? []) {
    if (t.done && daysAgo(t.doneAt ?? t.createdAt) > 7) continue; // 완료는 최근 7일만
    cards.push({
      id: `todo:${t.id}`,
      type: 'todo',
      title: t.text,
      column: t.done ? 'done' : 'todo',
      steps: stepsAt(['할 일', '완료'], t.done ? 1 : 0),
      meta: [{ text: `${shortDate(t.createdAt)}${t.createdBy ? ` · ${t.createdBy.split('@')[0]}` : ''}` }],
      assignees: t.createdBy ? [t.createdBy] : [],
      mine: !t.done && (t.createdBy ?? '').toLowerCase() === me,
      mineReason: '내가 만든 할 일',
      href: '/garden/settings',
      actionLabel: '열기',
      tab: TYPE_TAB.todo,
      sortAt: t.createdAt,
    });
  }

  // 권한 필터 — 열 수 없는 화면의 카드는 아예 보내지 않는다
  const visible = cards.filter((c) => !allowedTabs || allowedTabs.includes(c.tab));
  visible.sort((a, b) => Number(b.mine) - Number(a.mine) || a.sortAt.localeCompare(b.sortAt));

  return NextResponse.json({ cards: visible, me });
}
