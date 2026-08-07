import { NextResponse } from 'next/server';
import type { GardenTodo } from '@/lib/garden-todos';
import { gardenTodoRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';

// 기록별 blob 저장(lib/blob-records) — 두 명이 동시에 추가·토글해도 서로 다른 파일이라 유실이 없다.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  return { supabase, user };
}

// 화면은 최신 추가가 위 — readAll(오래된 순)을 뒤집어 구 API 의 unshift 순서를 유지한다
const newestFirst = (todos: GardenTodo[]) => todos.slice().reverse();

export async function GET() {
  const g = await requireUser();
  if ('error' in g) return g.error;
  return NextResponse.json(newestFirst(await gardenTodoRecords.readAll()));
}

// 추가: { text } / 완료 토글: { id, done }
export async function POST(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const body = await req.json();

  if (body.id !== undefined) {
    const todo = await gardenTodoRecords.readOne(String(body.id));
    if (!todo) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
    todo.done = !!body.done;
    if (todo.done) {
      todo.doneAt = new Date().toISOString();
      todo.doneBy = g.user.email ?? '';
    } else {
      todo.doneAt = undefined;
      todo.doneBy = undefined;
    }
    await gardenTodoRecords.writeOne(todo);
    const all = await gardenTodoRecords.readAll();
    return NextResponse.json(newestFirst(all.map((t) => (t.id === todo.id ? todo : t))));
  }

  const text = String(body.text ?? '').trim().slice(0, 200);
  if (!text) return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 });
  const todo: GardenTodo = {
    id: crypto.randomUUID(),
    text,
    done: false,
    createdAt: new Date().toISOString(),
    createdBy: g.user.email ?? '',
  };
  await gardenTodoRecords.writeOne(todo);
  await logActivity(g.supabase, g.user, '가든서비스 투두 추가', text);
  // 방금 쓴 blob 은 목록 인덱스에 아직 안 보일 수 있어 응답에 직접 포함한다
  const all = await gardenTodoRecords.readAll();
  if (!all.some((t) => t.id === todo.id)) all.push(todo);
  return NextResponse.json(newestFirst(all));
}

// 삭제: ?id=<uuid>
export async function DELETE(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  const target = await gardenTodoRecords.deleteOne(id);
  if (!target) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
  await logActivity(g.supabase, g.user, '가든서비스 투두 삭제', target.text);
  // 삭제 직후 목록 인덱스에 남아 있을 수 있어 응답에서 확실히 제외한다
  const all = (await gardenTodoRecords.readAll()).filter((t) => t.id !== id);
  return NextResponse.json(newestFirst(all));
}
