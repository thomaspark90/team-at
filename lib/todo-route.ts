import { NextResponse } from 'next/server';
import type { GardenTodo } from '@/lib/garden-todos';
import type { blobCollection } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';

// 투두 API 공용 핸들러 — 가든(/api/garden-todos)과 스탭밀(/api/staffmeal-todos)이
// 컬렉션·활동로그 라벨만 다르고 동작이 같아, 라우트마다 복붙하지 않고 여기서 만든다.
// 섹션 권한은 미들웨어(sectionsForApiPath)가 라우트 경로로 거른다.

type TodoRecords = ReturnType<typeof blobCollection<GardenTodo>>;

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

/** label 은 활동 로그용 브랜드 이름 — '가든서비스' | '스탭밀' */
export function makeTodoHandlers(records: TodoRecords, label: string) {
  async function GET() {
    const g = await requireUser();
    if ('error' in g) return g.error;
    return NextResponse.json(newestFirst(await records.readAll()));
  }

  // 추가: { text } / 완료 토글: { id, done }
  async function POST(req: Request) {
    const g = await requireUser();
    if ('error' in g) return g.error;
    const body = await req.json();

    if (body.id !== undefined) {
      const todo = await records.readOne(String(body.id));
      if (!todo) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
      todo.done = !!body.done;
      if (todo.done) {
        todo.doneAt = new Date().toISOString();
        todo.doneBy = g.user.email ?? '';
      } else {
        todo.doneAt = undefined;
        todo.doneBy = undefined;
      }
      await records.writeOne(todo);
      const all = await records.readAll();
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
    await records.writeOne(todo);
    await logActivity(g.supabase, g.user, `${label} 투두 추가`, text);
    // 방금 쓴 blob 은 목록 인덱스에 아직 안 보일 수 있어 응답에 직접 포함한다
    const all = await records.readAll();
    if (!all.some((t) => t.id === todo.id)) all.push(todo);
    return NextResponse.json(newestFirst(all));
  }

  // 삭제: ?id=<uuid>
  async function DELETE(req: Request) {
    const g = await requireUser();
    if ('error' in g) return g.error;
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    const target = await records.deleteOne(id);
    if (!target) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
    await logActivity(g.supabase, g.user, `${label} 투두 삭제`, target.text);
    // 삭제 직후 목록 인덱스에 남아 있을 수 있어 응답에서 확실히 제외한다
    const all = (await records.readAll()).filter((t) => t.id !== id);
    return NextResponse.json(newestFirst(all));
  }

  return { GET, POST, DELETE };
}
