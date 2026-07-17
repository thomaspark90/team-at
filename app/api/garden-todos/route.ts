import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { GardenTodo } from '@/lib/garden-todos';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';

const DATA_PATH = 'data/garden-todos.json';

async function readStore(): Promise<{ todos: GardenTodo[] }> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { todos: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as { todos: GardenTodo[] };
  } catch {
    return { todos: [] };
  }
}

async function writeStore(store: { todos: GardenTodo[] }) {
  await put(DATA_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  return { supabase, user };
}

export async function GET() {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const data = await readStore();
  return NextResponse.json(data.todos);
}

// 추가: { text } / 완료 토글: { id, done }
export async function POST(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const body = await req.json();
  const data = await readStore();

  if (body.id !== undefined) {
    const todo = data.todos.find((t) => t.id === String(body.id));
    if (!todo) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
    todo.done = !!body.done;
    if (todo.done) {
      todo.doneAt = new Date().toISOString();
      todo.doneBy = g.user.email ?? '';
    } else {
      todo.doneAt = undefined;
      todo.doneBy = undefined;
    }
  } else {
    const text = String(body.text ?? '').trim().slice(0, 200);
    if (!text) return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 });
    data.todos.unshift({
      id: crypto.randomUUID(),
      text,
      done: false,
      createdAt: new Date().toISOString(),
      createdBy: g.user.email ?? '',
    });
    await logActivity(g.supabase, g.user, '가든서비스 투두 추가', text);
  }

  await writeStore(data);
  return NextResponse.json(data.todos);
}

// 삭제: ?id=<uuid>
export async function DELETE(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  const data = await readStore();
  const target = data.todos.find((t) => t.id === id);
  if (!target) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
  data.todos = data.todos.filter((t) => t.id !== id);
  await writeStore(data);
  await logActivity(g.supabase, g.user, '가든서비스 투두 삭제', target.text);
  return NextResponse.json(data.todos);
}
