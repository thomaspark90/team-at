import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinanceTask, TaskStatus } from '@/lib/finance/tasks';
import { WEEKLY_TEMPLATES, MONTHLY_TEMPLATES, weekPeriodOf, monthPeriodOf } from '@/lib/finance/tasks';
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

  const data = await readStore();
  const now = new Date();
  const week = weekPeriodOf(now);
  const month = monthPeriodOf(now);
  let seeded = false;

  for (const t of WEEKLY_TEMPLATES) {
    if (!data.tasks.some((x) => x.templateId === t.id && x.period === week.key)) {
      data.tasks.push({
        id: crypto.randomUUID(),
        title: t.title,
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
  return NextResponse.json(data.tasks.filter((t) => !t.removed));
}

// 단발 업무 수동 추가: { title, due? }
export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? '').trim();
  if (!title) return NextResponse.json({ error: '제목을 입력해 주세요.' }, { status: 400 });
  const due = typeof body?.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : null;

  const data = await readStore();
  data.tasks.push({
    id: crypto.randomUUID(),
    title,
    cadence: 'once',
    period: '',
    periodLabel: '',
    due,
    status: 'todo',
    createdAt: new Date().toISOString(),
  });
  await writeStore(data);
  await logActivity(supabase, user, '재무 업무 추가', title);
  return NextResponse.json(data.tasks.filter((t) => !t.removed));
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
  return NextResponse.json(data.tasks.filter((t) => !t.removed));
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
  return NextResponse.json(data.tasks.filter((t) => !t.removed));
}
