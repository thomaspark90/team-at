import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isOwner } from '@/lib/finance/access';
import { readGardenTopics } from '@/lib/garden-notify-topics-server';
import { purchaseRecords, grindMeasurementRecords, gardenTodoRecords, staffmealTodoRecords, alignmentRecords, dripRecipeRecords } from '@/lib/blob-records';
import { normalize } from '@/lib/pricing';
import { STORES } from '@/lib/types';
import type { BeanMetaStore, DripRecipe } from '@/lib/types';
import { isBeanArchived } from '@/lib/garden/bean-groups';
import type { GardenTodo } from '@/lib/garden-todos';
import type { AlignmentEvent } from '@/lib/grinder-alignments';
import { latestInspectionDate } from '@/lib/grinder-alignments';
import type { StaffMealRecord } from '@/lib/types';
import type { BoardCard, BoardScope, GrinderUpkeepRow } from '@/lib/garden/board';
import { TYPE_TAB, daysAgo, shortDate, stepsAt, kstDay } from '@/lib/garden/board';
import { roastInfo, restStage } from '@/lib/garden/roast';
import { RECEIVE_FLOW_FROM, receiveAssigned, receiveTodo } from '@/lib/garden/receive';

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

const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.label ?? id;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  // 브랜드별 보드 — 가든 화면은 가든 일만, 스탭밀 화면은 스탭밀 일만 받는다
  const scope: BoardScope = new URL(req.url).searchParams.get('scope') === 'staffmeal' ? 'staffmeal' : 'garden';

  const me = (user.email ?? '').toLowerCase();
  const [topics, access] = await Promise.all([
    readGardenTopics(),
    supabase
      .schema('finance')
      .from('garden_tab_access')
      .select('tabs, sections')
      .eq('user_id', user.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);
  const owner = isOwner(user.email);
  const allowedTabs = owner ? null : ((access?.tabs as string[] | null) ?? null);
  const allowedSections = owner ? null : ((access?.sections as string[] | null) ?? null);

  // 섹션 권한 — 이 보드를 볼 수 있는 사람인지 (미들웨어는 라우트 단위라 scope 별 판단은 여기서)
  const needSection = scope === 'staffmeal' ? 'studio' : 'garden';
  if (allowedSections && !allowedSections.includes(needSection)) {
    return NextResponse.json({ cards: [], me, grinder: [] });
  }

  const cards: BoardCard[] = [];
  // 담당자 판정 — 토픽에 지정된 사람. 비어 있으면 '누구나'(모두에게 내 차례로 보이지 않음)
  const owns = (emails: string[]) => emails.map((e) => e.toLowerCase()).includes(me);

  const isGarden = scope === 'garden';
  const [purchases, recipes, measurements, todos, mealsStore, alignEvents, beanStore] =
    await Promise.all([
      isGarden ? purchaseRecords.readAll().catch(() => []) : [],
      isGarden ? dripRecipeRecords.readAll().catch(() => [] as DripRecipe[]) : [],
      isGarden ? grindMeasurementRecords.readAll().catch(() => []) : [],
      // 투두는 브랜드별 컬렉션 — 가든 보드엔 가든 투두, 스탭밀 보드엔 스탭밀 투두
      (isGarden ? gardenTodoRecords : staffmealTodoRecords).readAll().catch(() => [] as GardenTodo[]),
      isGarden ? null : readJson<{ records: StaffMealRecord[] }>('data/staffmeals.json'),
      isGarden ? alignmentRecords.readAll().catch(() => [] as AlignmentEvent[]) : [],
      isGarden ? readJson<BeanMetaStore>('data/garden-beans.json') : null,
    ]);

  // ── 스탭밀 : 오늘 인스타 스토리 메뉴 등록 ──
  if (!isGarden) {
    const todayKst = kstDay(new Date().toISOString());
    const records = mealsStore?.records ?? [];
    const todayRec = records.find((r) => kstDay(r.createdAt) === todayKst);
    const last = records.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    cards.push({
      id: `meal:${todayKst}`,
      type: 'meal',
      title: '오늘 스탭밀 메뉴 스토리',
      column: todayRec ? 'done' : 'todo',
      steps: stepsAt(['메뉴 입력', '이미지 저장', '스토리 업로드'], todayRec ? 2 : 0),
      meta: todayRec
        ? [{ text: `${shortDate(todayRec.createdAt)} 등록`, tone: 'ok' as const }]
        : [
            ...(last
              ? [{ text: `최근 등록 ${shortDate(last.createdAt)}`, ...(daysAgo(last.createdAt) >= 2 ? { tone: 'late' as const } : {}) }]
              : [{ text: '등록 기록 없음' }]),
          ],
      assignees: [],
      mine: false,
      href: '/studio/menu',
      actionLabel: todayRec ? '기록 보기' : '메뉴 만들기',
      tab: null,
      sortAt: last?.createdAt ?? new Date().toISOString(),
    });
  }

  // ── 발주 → 판매 준비 : 발주 · 레시피(ICE·HOT) · 판매가 · 원두카드(인쇄 완료) ── (2026-11-03 대표 결정)
  // 레시피는 ICE·HOT 둘 다 있어야(어느 지점이든) 완료, 판매가는 책정(또는 미책정 숨김), 원두카드는 디자이너의 '인쇄 완료' 표시.
  // 카드는 현재 단계 담당자·탭 기준으로 보인다. 로스팅 경과일(미기재면 발주일+1 추정)은 메타로만 표시 — 판매를 막지 않는다.
  const brewsByBean = new Map<string, Set<string>>();
  for (const r of recipes) {
    const set = brewsByBean.get(r.beanKey) ?? new Set<string>();
    set.add(r.brewType ?? 'ice');
    brewsByBean.set(r.beanKey, set);
  }
  const latestByBean = new Map<string, (typeof purchases)[number]>();
  for (const p of purchases) {
    const k = normalize(p.bean);
    const cur = latestByBean.get(k);
    if (!cur || p.createdAt.localeCompare(cur.createdAt) > 0) latestByBean.set(k, p);
  }
  // 아카이브한 원두(재발주 전)는 레시피를 지웠어도 처리 끝난 것으로 본다 — 아카이브 '기록 삭제' 후 할 일로 되살아나지 않게
  const metaByBean = new Map((beanStore?.beans ?? []).map((b) => [b.beanKey, b]));
  const ORDER_STEPS = ['발주', '레시피', '판매가', '원두카드'];
  const ORDER_FLOW_FROM = '2026-11-03';
  const stageOwners = [[], topics.recipeNew ?? [], topics.salePriceRequest ?? [], topics.beanCard ?? []];
  const stageInfo = [
    null,
    { reason: '레시피 담당', href: '/garden/recipes', action: '레시피 설정', tab: 'recipes' },
    { reason: '판매가 담당', href: '/garden/saleprice', action: '판매가 설정', tab: 'saleprice' },
    { reason: '원두카드 담당', href: '/garden/beancard', action: '원두카드 인쇄', tab: 'beancard' },
  ];
  for (const [key, p] of Array.from(latestByBean.entries())) {
    // 새 4단계 흐름은 2026-11-03 발주분부터 — 이전 발주는 '인쇄 완료' 기록이 없으니 예전 기준(레시피 하나라도 있으면 완료).
    // 단계 표시는 실제 상태 그대로(판매가 미책정이면 ✓ 안 붙음), 칸(column)만 완료로 둔다.
    const legacyDone = kstDay(p.createdAt) < ORDER_FLOW_FROM && brewsByBean.has(key);
    const archived = isBeanArchived(metaByBean.get(key), p);
    const brews = brewsByBean.get(key);
    const recipeDone = archived || (!!brews?.has('ice') && !!brews?.has('hot'));
    const priceDone = archived || p.chosenPrice != null || !!p.priceDismissed;
    const cardDone = archived || legacyDone || !!p.cardDone;
    const current = !recipeDone ? 1 : !priceDone ? 2 : !cardDone ? 3 : 4;
    const allDone = current === 4 || legacyDone;
    const info = allDone ? null : (stageInfo[current] ?? null);
    const owners = info ? stageOwners[current] : [];
    const d = daysAgo(p.createdAt);
    const roast = roastInfo(p);
    const missing = brews ? (['ice', 'hot'] as const).filter((b) => !brews.has(b)).map((b) => b.toUpperCase()) : [];
    cards.push({
      id: `order:${p.id}`,
      type: 'order',
      title: p.bean,
      column: allDone ? 'done' : current === 1 && !brews ? 'todo' : 'doing',
      steps: stepsAt(ORDER_STEPS, current),
      meta: [
        { text: `${shortDate(p.createdAt)} 발주` },
        ...(roast && !allDone
          ? [{
              text: `로스팅 ${roast.estimated ? '~' : ''}D+${roast.days}${restStage(roast.days) === 'resting' ? ' 디게싱 중' : ''}`,
              ...(restStage(roast.days) === 'resting' ? { tone: 'late' as const } : {}),
            }]
          : []),
        ...(current === 1 && missing.length === 1 ? [{ text: `${missing[0]} 레시피 없음`, tone: 'late' as const }] : []),
        ...(p.chosenPrice != null ? [{ text: `${p.chosenPrice.toLocaleString()}원` }] : []),
        // 원두카드 단계인데 영문명이 아직 확정 전 — 수령 후 확정되면 담당자에게 알림이 간다
        ...(current === 3 && !p.beanEnConfirmed ? [{ text: '영문명 미확정 · 수령 대기', tone: 'late' as const }] : []),
        ...(!allDone && d >= 3 ? [{ text: `${d}일째 진행 중`, tone: 'late' as const }] : []),
      ],
      assignees: owners,
      mine: !allDone && owns(owners),
      mineReason: info?.reason,
      href: info?.href ?? '/garden/recipes',
      actionLabel: info?.action ?? '레시피 보기',
      tab: info?.tab ?? TYPE_TAB.order,
      sortAt: p.createdAt,
    });
  }

  // ── 원두 수령 : 로스팅 날짜 기재 · 영문명 확정 ── (2026-11-19 대표 결정)
  // 발주 흐름(레시피·판매가·원두카드)과 담당이 달라 별도 카드로 세운다 — 택배를 받는 건 발주한 사람 쪽이다.
  // 카드 버튼이 보드에서 수령 창을 바로 연다. 둘 다 기재되면 카드가 사라진다.
  // 누를 수 있는 사람: 설정의 '원두 수령 담당'이 지정돼 있으면 그 사람들(발주 탭 권한 불필요),
  // 비어 있으면 발주 탭 권한이 있는 사람 — 이때 '내 차례'는 발주한 계정.
  const receivers = (topics.beanReceive ?? []).map((e) => e.toLowerCase());
  const receiveAssignedMe = receiveAssigned(receivers, me);
  const canReceive = owner || (receiveAssignedMe ?? (!allowedTabs || allowedTabs.includes('pricing')));
  for (const p of purchases) {
    if (kstDay(p.createdAt) < RECEIVE_FLOW_FROM) continue;
    const todo = receiveTodo(p);
    if (todo.done) continue;
    const key = normalize(p.bean);
    if (isBeanArchived(metaByBean.get(key), latestByBean.get(key))) continue;
    const orderer = (p.createdBy ?? '').toLowerCase();
    const d = daysAgo(p.createdAt);
    cards.push({
      id: `receive:${p.id}`,
      type: 'order',
      title: `${p.bean} 수령`,
      column: todo.roastDate ? 'todo' : 'doing',
      steps: stepsAt(['발주', '로스팅 날짜', '영문명 확정'], todo.roastDate ? 1 : 2),
      meta: [
        { text: `${shortDate(p.createdAt)} 발주` },
        ...(p.store ? [{ text: storeLabel(p.store) }] : []),
        ...(p.staffName ? [{ text: `${p.staffName}님` }] : []),
        ...(d >= 5 ? [{ text: `${d}일째 미수령`, tone: 'late' as const }] : []),
      ],
      assignees: receivers.length ? receivers : orderer ? [orderer] : [],
      mine: receivers.length ? receiveAssignedMe === true : !!orderer && orderer === me,
      mineReason: receivers.length ? '수령 담당' : '발주한 원두',
      receive: {
        id: p.id,
        bean: p.bean,
        roastery: p.roastery,
        roastDate: p.roastDate,
        beanEn: p.beanEn,
        beanEnConfirmed: p.beanEnConfirmed,
        allowed: canReceive,
      },
      href: `/garden/pricing?receive=${p.id}`,
      actionLabel: todo.roastDate ? '수령 기재' : '영문명 확정',
      // 담당자가 지정돼 있으면 발주 탭이 없는 담당자도 보드에서 봐야 한다 — 탭 필터를 거치지 않는다
      tab: receivers.length ? null : 'pricing',
      sortAt: p.createdAt,
    });
  }

  // ── 그라인더 관리 : 측정·얼라인 점검은 카드로 띄우지 않는다 (2026-11-19 대표 결정) ──
  // 정기 리마인더·내 차례 알림 없이, 보드 맨 아래 표에 지점별 마지막 기록일만 버튼으로 보여준다.
  // 캘리브레이션 탭을 열 수 없는 사람에겐 보내지 않는다(눌러도 튕기므로).
  const canCalibrate = !allowedTabs || allowedTabs.includes('calibration');
  const grinder: GrinderUpkeepRow[] =
    isGarden && canCalibrate
      ? STORES.map((s) => ({
          store: s.id,
          label: s.label,
          lastMeasure:
            measurements
              .filter((m) => m.store === s.id)
              .map((m) => kstDay(m.createdAt))
              .sort()
              .at(-1) ?? null,
          lastInspect: latestInspectionDate(alignEvents, s.id),
        }))
      : [];

  // ── 네이버 리뷰 : 수집 · 초안 · 승인 · 등록 ──
  const reviewOwners = topics.reviewIssue ?? [];
  // 네이버 리뷰는 가든서비스 매장(양재천·판교) 것이라 가든 보드에만 올린다
  const { data: reviews } = isGarden
    ? await supabase
        .schema('finance')
        .from('place_reviews')
        .select('id, store_key, rating, issue_note, status, reviewed_at')
        .eq('issue', true)
        .in('status', ['new', 'drafted', 'approved'])
        .order('reviewed_at', { ascending: false })
        .limit(20)
    : { data: [] };
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
  // 송금 요청·월 자료 마감 리마인더는 회계 일이라 여기(브랜드 보드)엔 안 띄운다 —
  // 회계 대시보드(/finance)의 '해야 할 일'에서 다룬다(2026-08-09).

  // ── 투두 ──
  for (const t of todos) {
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
      href: isGarden ? '/garden/settings' : '/studio/settings',
      actionLabel: '열기',
      // 스탭밀 투두는 가든 탭 체계 밖 — 섹션(studio) 권한으로만 판단한다 (meal 카드와 동일)
      tab: isGarden ? TYPE_TAB.todo : null,
      sortAt: t.createdAt,
    });
  }

  // 권한 필터 — 열 수 없는 화면의 카드는 아예 보내지 않는다 (tab null = 탭 체계 밖)
  const visible = cards.filter((c) => c.tab === null || !allowedTabs || allowedTabs.includes(c.tab));
  visible.sort((a, b) => Number(b.mine) - Number(a.mine) || a.sortAt.localeCompare(b.sortAt));

  return NextResponse.json({ cards: visible, me, grinder });
}
