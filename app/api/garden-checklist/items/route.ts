import { NextResponse } from 'next/server';
import { badRequest, dbError, forbid, requireChecklistActor } from '@/lib/checklist/access';
import { loadItems, toItem } from '@/lib/checklist/queries';
import { isStore } from '@/lib/schedule/access';

export const runtime = 'nodejs';

// 항목 관리 — 운영진 또는 항목 관리 권한. 문구·주기·사진 필수·켜고 끄기·삭제. 순서는 reorder.
// 삭제는 지난 기록이 참조하므로 행을 남기고 목록에서만 뺀다. PATCH { id, deleted: false } 로 되돌린다.

type Body = Record<string, unknown>;

/** 입력값 → DB 컬럼. 준 필드만 바꾼다. 오류면 문구(string). */
function toColumns(b: Body): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  for (const [key, col] of [['section', 'section'], ['label', 'label']] as const) {
    if (key in b) {
      const v = typeof b[key] === 'string' ? (b[key] as string).trim() : '';
      if (!v) return key === 'label' ? '항목 이름을 적어주세요.' : '구역을 적어주세요.';
      out[col] = v.slice(0, 120);
    }
  }
  if ('detail' in b) out.detail = typeof b.detail === 'string' ? b.detail.trim().slice(0, 200) : '';
  if ('photoRequired' in b) out.photo_required = b.photoRequired === true;
  if ('active' in b) out.active = b.active === true;
  if (b.deleted === false) {
    out.deleted_at = null;
    out.deleted_by_name = null;
  }
  if ('sortOrder' in b) {
    if (!Number.isInteger(b.sortOrder)) return '순서가 올바르지 않습니다.';
    out.sort_order = b.sortOrder;
  }
  if ('frequency' in b) {
    const f = b.frequency;
    if (f === 'daily') {
      out.frequency = 'daily';
      out.weekday = null;
    } else if (f === 'weekly' || f === 'monthly') {
      const d = b.weekday;
      if (!Number.isInteger(d) || (d as number) < 0 || (d as number) > 6) return '요일을 골라주세요.';
      out.frequency = f;
      out.weekday = d;
    } else return '주기가 올바르지 않습니다.';
  }
  return out;
}

export async function GET(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  if (!a.canManageItems) return forbid();
  const store = new URL(req.url).searchParams.get('store');
  if (!isStore(store)) return badRequest('지점을 선택하세요.');
  try {
    return NextResponse.json({ items: await loadItems(a.svc, store) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  if (!a.canManageItems) return forbid();
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b || !isStore(b.store) || (b.shiftType !== 'open' && b.shiftType !== 'close')) return badRequest('요청이 올바르지 않습니다.');
  const cols = toColumns({ frequency: 'daily', ...b });
  if (typeof cols === 'string') return badRequest(cols);
  if (!cols.label || !cols.section) return badRequest('구역과 항목 이름을 적어주세요.');
  const { data, error } = await a.svc
    .from('checklist_items')
    .insert({ ...cols, store: b.store, shift_type: b.shiftType, origin: 'app' })
    .select('*')
    .single();
  if (error) return dbError(error);
  return NextResponse.json({ item: toItem(data) });
}

export async function PATCH(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  if (!a.canManageItems) return forbid();
  const b = (await req.json().catch(() => null)) as Body | null;
  const id = Number(b?.id);
  if (!b || !Number.isInteger(id)) return badRequest('항목이 올바르지 않습니다.');
  const cols = toColumns(b);
  if (typeof cols === 'string') return badRequest(cols);
  const { data, error } = await a.svc
    .from('checklist_items')
    .update({ ...cols, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return dbError(error);
  return NextResponse.json({ item: toItem(data) });
}

export async function DELETE(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  if (!a.canManageItems) return forbid();
  const b = (await req.json().catch(() => null)) as Body | null;
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return badRequest('항목이 올바르지 않습니다.');
  const now = new Date().toISOString();
  const { error } = await a.svc.from('checklist_items').update({ deleted_at: now, deleted_by_name: a.name, updated_at: now }).eq('id', id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
