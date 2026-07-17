import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinanceTask, TaskStatus, TaskBoardId, TaskCheck } from '@/lib/finance/tasks';
import { WEEKLY_TEMPLATES, MONTHLY_TEMPLATES, weekPeriodOf, monthPeriodOf, boardOfTemplate, targetYmOf } from '@/lib/finance/tasks';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { logActivity } from '@/lib/finance/activity';

export const runtime = 'nodejs';

const DATA_PATH = 'data/finance-tasks.json';
const STATUSES: TaskStatus[] = ['todo', 'doing', 'done'];

async function readStore(): Promise<{ tasks: FinanceTask[] }> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { tasks: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as { tasks: FinanceTask[] };
  } catch {
    return { tasks: [] };
  }
}

async function writeStore(store: { tasks: FinanceTask[] }) {
  await put(DATA_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// 템플릿 카드의 실제 데이터 입력 여부 확인 — 완료 판단 근거를 카드에 내려준다.
// 조회 실패(마이그레이션 전 등)한 항목은 check 없이 카드만 표시(비치명적).
async function computeChecks(supabase: SupabaseClient, tasks: FinanceTask[]): Promise<Map<string, TaskCheck>> {
  const out = new Map<string, TaskCheck>();
  const open = tasks.filter((t) => t.templateId && t.status !== 'done');
  const yms = Array.from(
    new Set(open.filter((t) => t.cadence === 'monthly').map((t) => targetYmOf(t.period)).filter(Boolean)),
  ) as string[];
  const fin = supabase.schema('finance');

  try {
    const [posRes, feeRes, invRes, closeRes] = yms.length
      ? await Promise.all([
          fin.from('pos_sales').select('ym,brand').in('ym', yms),
          fin.from('channel_fees').select('ym,brand').in('ym', yms),
          fin.from('inventory').select('ym').in('ym', yms),
          fin.from('monthly_close').select('ym,status').in('ym', yms),
        ])
      : [null, null, null, null];
    const posSet = posRes && !posRes.error
      ? new Set((posRes.data as { ym: string; brand?: string }[]).map((r) => `${r.ym}|${r.brand ?? 'garden'}`))
      : null;
    const feeSet = feeRes && !feeRes.error
      ? new Set((feeRes.data as { ym: string; brand?: string }[]).map((r) => `${r.ym}|${r.brand ?? 'garden'}`))
      : null;
    const invSet = invRes && !invRes.error
      ? new Set((invRes.data as { ym: string }[]).map((r) => r.ym))
      : null;
    const closedSet = closeRes && !closeRes.error
      ? new Set((closeRes.data as { ym: string; status: string }[]).filter((r) => r.status === 'confirmed').map((r) => r.ym))
      : null;

    // 월별 은행/카드 거래 존재 여부 (대상 월이 보통 1개라 순차 조회로 충분)
    const txHas = new Map<string, boolean>();
    for (const ym of yms) {
      for (const source of ['bank', 'card'] as const) {
        if (!open.some((t) => (t.templateId === 'bank-pdf' && source === 'bank') || (t.templateId === 'card-stmt' && source === 'card'))) continue;
        const { count, error } = await fin
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('ym', ym)
          .eq('source', source);
        if (!error) txHas.set(`${ym}|${source}`, (count ?? 0) > 0);
      }
    }
    // 미분류 잔여 (주간 '거래 분류' 카드용 — 기간 무관 현재 잔여)
    let unclassified: number | null = null;
    if (open.some((t) => t.templateId === 'classify')) {
      const { count, error } = await fin
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .is('category_id', null);
      if (!error) unclassified = count ?? 0;
    }

    const chk = (done: boolean, doneLabel: string, notLabel: string): TaskCheck => ({
      done,
      label: done ? doneLabel : notLabel,
    });
    for (const t of open) {
      const ym = targetYmOf(t.period);
      switch (t.templateId) {
        case 'pos':
          if (ym && posSet) out.set(t.id, chk(posSet.has(`${ym}|garden`), '업로드 확인됨', '아직 미업로드'));
          break;
        case 'pos-staffmeal':
          if (ym && posSet) out.set(t.id, chk(posSet.has(`${ym}|staffmeal`), '업로드 확인됨', '아직 미업로드'));
          break;
        case 'channel-fees':
          if (ym && feeSet) out.set(t.id, chk(feeSet.has(`${ym}|garden`), '입력 확인됨', '아직 미입력'));
          break;
        case 'channel-fees-staffmeal':
          if (ym && feeSet) out.set(t.id, chk(feeSet.has(`${ym}|staffmeal`), '입력 확인됨', '아직 미입력'));
          break;
        case 'inventory':
          if (ym && invSet) out.set(t.id, chk(invSet.has(ym), '입력 확인됨', '아직 미입력'));
          break;
        case 'close':
          if (ym && closedSet) out.set(t.id, chk(closedSet.has(ym), '확정됨', '아직 미확정'));
          break;
        case 'bank-pdf':
          if (ym && txHas.has(`${ym}|bank`)) out.set(t.id, chk(!!txHas.get(`${ym}|bank`), '업로드 확인됨', '아직 미업로드'));
          break;
        case 'card-stmt':
          if (ym && txHas.has(`${ym}|card`)) out.set(t.id, chk(!!txHas.get(`${ym}|card`), '업로드 확인됨', '아직 미업로드'));
          break;
        case 'classify':
          if (unclassified != null) out.set(t.id, chk(unclassified === 0, '미분류 0건', `미분류 ${unclassified}건 남음`));
          break;
      }
    }
  } catch {
    /* 확인 실패 시 체크 없이 보드만 표시 */
  }
  return out;
}

// 표시 대상 카드에 check 를 붙여 반환 — 모든 핸들러 공통 응답 형태
async function withChecks(supabase: SupabaseClient, tasks: FinanceTask[]) {
  const visible = tasks.filter((t) => !t.removed);
  const checks = await computeChecks(supabase, visible);
  return visible.map((t) => (checks.has(t.id) ? { ...t, check: checks.get(t.id) } : t));
}

// 업무 보드는 재무 담당(admin/classifier)만 — viewer는 지표 화면으로 안내됨
async function requireStaff(): Promise<
  { supabase: SupabaseClient; user: { id: string; email?: string | null } } | NextResponse
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }
  return { supabase, user };
}

// 이번 주/이번 달 템플릿 카드가 없으면 자동 생성해서 돌려준다.
// 삭제된 템플릿 카드는 removed 톰스톤으로 남아 재생성되지 않는다.
export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const data = await readStore();
  const now = new Date();
  const week = weekPeriodOf(now);
  const month = monthPeriodOf(now);
  let seeded = false;

  // 보드 분리 전에 저장된 카드 마이그레이션 — 템플릿은 원본 배정, 수동 카드는 재무 보드로
  for (const t of data.tasks) {
    if (!t.board) {
      t.board = boardOfTemplate(t.templateId);
      seeded = true;
    }
  }

  for (const t of WEEKLY_TEMPLATES) {
    if (!data.tasks.some((x) => x.templateId === t.id && x.period === week.key)) {
      data.tasks.push({
        id: crypto.randomUUID(),
        title: t.title,
        board: t.board,
        cadence: 'weekly',
        period: week.key,
        periodLabel: week.label,
        due: week.due,
        status: 'todo',
        templateId: t.id,
        href: t.href,
        createdAt: now.toISOString(),
      });
      seeded = true;
    }
  }
  for (const t of MONTHLY_TEMPLATES) {
    if (!data.tasks.some((x) => x.templateId === t.id && x.period === month.key)) {
      data.tasks.push({
        id: crypto.randomUUID(),
        title: t.title.replace('{M}', String(month.targetMonth)),
        board: t.board,
        cadence: 'monthly',
        period: month.key,
        periodLabel: month.label,
        due: `${month.key}-${String(t.dueDay).padStart(2, '0')}`,
        status: 'todo',
        templateId: t.id,
        href: t.href,
        createdAt: now.toISOString(),
      });
      seeded = true;
    }
  }
  if (seeded) await writeStore(data);

  // 실제 데이터 입력 여부를 카드에 붙여서 반환 — 완료 버튼 활성 판단 근거
  return NextResponse.json(await withChecks(supabase, data.tasks));
}

// 단발 업무 수동 추가: { title, board, due? }
export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? '').trim();
  if (!title) return NextResponse.json({ error: '제목을 입력해 주세요.' }, { status: 400 });
  const board: TaskBoardId = body?.board === 'accounting' ? 'accounting' : 'finance';
  const due = typeof body?.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : null;

  const data = await readStore();
  data.tasks.push({
    id: crypto.randomUUID(),
    title,
    board,
    cadence: 'once',
    period: '',
    periodLabel: '',
    due,
    status: 'todo',
    createdAt: new Date().toISOString(),
  });
  await writeStore(data);
  await logActivity(supabase, user, '재무 업무 추가', title);
  return NextResponse.json(await withChecks(supabase, data.tasks));
}

// 상태 이동/수정: { id, status?, title?, due? }
export async function PATCH(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  const data = await readStore();
  const task = data.tasks.find((t) => t.id === String(body?.id ?? ''));
  if (!task || task.removed) return NextResponse.json({ error: '업무를 찾을 수 없습니다.' }, { status: 404 });

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: '상태 값이 올바르지 않습니다.' }, { status: 400 });
    }
    task.status = body.status as TaskStatus;
  }
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return NextResponse.json({ error: '제목을 입력해 주세요.' }, { status: 400 });
    task.title = title;
  }
  if (body.due !== undefined) {
    task.due = typeof body.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : null;
  }
  task.updatedAt = new Date().toISOString();
  task.updatedBy = user.email ?? '';
  await writeStore(data);

  if (body.status !== undefined) {
    await logActivity(supabase, user, '재무 업무 이동', `${task.title} · ${task.status}`);
  }
  return NextResponse.json(await withChecks(supabase, data.tasks));
}

// 삭제: { id } — 템플릿 카드는 톰스톤(재생성 방지), 수동 카드는 실제 삭제
export async function DELETE(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? '');
  const data = await readStore();
  const task = data.tasks.find((t) => t.id === id);
  if (!task || task.removed) return NextResponse.json({ error: '업무를 찾을 수 없습니다.' }, { status: 404 });

  if (task.templateId) {
    task.removed = true;
    task.updatedAt = new Date().toISOString();
    task.updatedBy = user.email ?? '';
  } else {
    data.tasks = data.tasks.filter((t) => t.id !== id);
  }
  await writeStore(data);
  await logActivity(supabase, user, '재무 업무 삭제', task.title);
  return NextResponse.json(await withChecks(supabase, data.tasks));
}
