import { NextResponse } from 'next/server';
import { badRequest, dbError, requireReorderActor } from '@/lib/reorder/access';
import { parseSpec } from '@/lib/reorder/spec';
import { isStore } from '@/lib/schedule/access';

export const runtime = 'nodejs';

// 품목 추가·수정·삭제. 후보를 품목으로 올릴 때는 matchNames 에 그 상품명을 담아 보낸다.
// 기존 품목에 후보를 합칠 때는 PATCH { id, addMatchName }.

type Body = Record<string, unknown>;

const words = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 20);

/** 입력값 → DB 컬럼. 준 필드만 바꾼다. 오류면 문구(string). */
function toColumns(b: Body): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  if ('name' in b) {
    const v = typeof b.name === 'string' ? b.name.trim() : '';
    if (!v) return '품목 이름을 적어주세요.';
    out.name = v.slice(0, 120);
  }
  if ('spec' in b) {
    const s = b.spec as { qty?: unknown; unit?: unknown; pack?: unknown } | null;
    if (s === null) {
      out.spec_qty = null;
      out.spec_unit = null;
      out.pack_count = 1;
    } else {
      const qty = Number(s?.qty);
      const pack = Number(s?.pack ?? 1);
      if (!(qty > 0) || !Number.isInteger(pack) || pack < 1 || !['g', 'ml', 'ea'].includes(String(s?.unit))) return '규격이 올바르지 않습니다.';
      out.spec_qty = qty;
      out.spec_unit = s?.unit;
      out.pack_count = pack;
    }
  }
  if ('searchQuery' in b) out.search_query = typeof b.searchQuery === 'string' ? b.searchQuery.trim().slice(0, 120) : '';
  if ('mustInclude' in b) out.must_include = words(b.mustInclude);
  if ('excludeWords' in b) out.exclude_words = words(b.excludeWords);
  if ('compare' in b) out.compare = b.compare === true;
  if ('active' in b) out.active = b.active === true;
  return out;
}

export async function POST(req: Request) {
  const a = await requireReorderActor();
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b || !isStore(b.store)) return badRequest('요청이 올바르지 않습니다.');
  const matchNames = words(b.matchNames);
  const name = typeof b.name === 'string' && b.name.trim() ? b.name : matchNames[0];
  // 규격을 따로 주지 않으면 이름에서 읽어 본다 — 못 읽으면 비워 둔다(규격 미확인).
  const guessed = 'spec' in b ? undefined : parseSpec(String(name ?? ''));
  const cols = toColumns({ ...b, name, ...(guessed ? { spec: guessed } : {}) });
  if (typeof cols === 'string') return badRequest(cols);
  const { data, error } = await a.svc
    .from('reorder_items')
    .insert({ ...cols, store: b.store, match_names: matchNames, search_query: cols.search_query ?? cols.name, updated_by_name: a.name })
    .select('id')
    .single();
  if (error) return dbError(error);
  return NextResponse.json({ id: Number(data.id) });
}

export async function PATCH(req: Request) {
  const a = await requireReorderActor();
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b || !Number.isInteger(b.id)) return badRequest('요청이 올바르지 않습니다.');
  const cols = toColumns(b);
  if (typeof cols === 'string') return badRequest(cols);
  if (b.deleted === true) cols.deleted_at = new Date().toISOString();
  if (b.deleted === false) cols.deleted_at = null;

  const addName = typeof b.addMatchName === 'string' ? b.addMatchName.trim() : '';
  const removeName = typeof b.removeMatchName === 'string' ? b.removeMatchName.trim() : '';
  if (addName || removeName) {
    const { data: cur, error } = await a.svc.from('reorder_items').select('match_names').eq('id', b.id).maybeSingle();
    if (error) return dbError(error);
    if (!cur) return badRequest('품목을 찾지 못했습니다.');
    const names = new Set<string>((cur.match_names as string[] | null) ?? []);
    if (addName) names.add(addName);
    if (removeName) names.delete(removeName);
    cols.match_names = Array.from(names);
  }
  if (!Object.keys(cols).length) return badRequest('바꿀 내용이 없습니다.');
  const { error } = await a.svc
    .from('reorder_items')
    .update({ ...cols, updated_at: new Date().toISOString(), updated_by_name: a.name })
    .eq('id', b.id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
