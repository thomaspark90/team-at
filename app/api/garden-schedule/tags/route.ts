import { NextResponse } from 'next/server';
import { badRequest, dbError, requireScheduleEditor } from '@/lib/schedule/access';
import { loadTags, newTagKey } from '@/lib/schedule/tags';
import { TAG_LABEL_MAX, TAG_MAX, type TagDef, type TagKind } from '@/lib/schedule/types';

export const runtime = 'nodejs';

// 역할·책임 태그 목록(운영진 전용). GET ?kind=role|duty / PUT { kind, items: [{ key?, label, color? }] } — 순서대로 통째로 교체.
// 목록에서 뺀 태그는 직원에게서도 지운다(역할 배열에서 제거, 책임 태그는 없음으로).
const isKind = (v: unknown): v is TagKind => v === 'role' || v === 'duty';
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function GET(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const kind = new URL(req.url).searchParams.get('kind');
  if (!isKind(kind)) return badRequest('종류가 올바르지 않습니다.');
  try {
    return NextResponse.json({ items: await loadTags(a.svc, kind) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isKind(b?.kind)) return badRequest('종류가 올바르지 않습니다.');
  if (!Array.isArray(b?.items)) return badRequest('목록이 올바르지 않습니다.');
  if (b.items.length > TAG_MAX) return badRequest(`${TAG_MAX}개까지 만들 수 있습니다.`);
  const kind: TagKind = b.kind;
  const items: TagDef[] = [];
  for (const it of b.items) {
    const label = String(it?.label ?? '').replace(/\s+/g, ' ').trim();
    if (!label || label.length > TAG_LABEL_MAX) return badRequest(`이름은 1~${TAG_LABEL_MAX}자입니다.`);
    const key = typeof it?.key === 'string' && it.key && !it.key.startsWith('new_') ? it.key : newTagKey(kind);
    if (items.some((x) => x.key === key)) return badRequest('같은 태그가 두 번 있습니다.');
    if (kind === 'role') {
      if (!COLOR_RE.test(String(it?.color ?? ''))) return badRequest(`${label}: 색을 고르세요.`);
      items.push({ key, label, color: String(it.color).toUpperCase() });
    } else items.push({ key, label });
  }
  if (kind === 'duty' && items.some((x) => x.key === 'none')) return badRequest("'none' 은 쓸 수 없는 키입니다.");

  const keep = items.map((x) => x.key);
  const { data: cur } = await a.svc.from('schedule_tags').select('key').eq('kind', kind);
  const removed = (cur ?? []).map((r) => r.key as string).filter((k) => !keep.includes(k));

  // 1) 뺀 태그를 직원에게서 지운다
  if (removed.length) {
    if (kind === 'role') {
      const { data: staff, error } = await a.svc.from('schedule_staff').select('id, roles').overlaps('roles', removed);
      if (error) return dbError(error);
      for (const s of staff ?? []) {
        const roles = ((s.roles as string[]) ?? []).filter((k) => !removed.includes(k));
        const { error: uErr } = await a.svc.from('schedule_staff').update({ roles }).eq('id', s.id);
        if (uErr) return dbError(uErr);
      }
    } else {
      const { error } = await a.svc.from('schedule_staff').update({ duty_tag: null }).in('duty_tag', removed);
      if (error) return dbError(error);
    }
    const { error: dErr } = await a.svc.from('schedule_tags').delete().eq('kind', kind).in('key', removed);
    if (dErr) return dbError(dErr);
  }
  // 2) 나머지는 순서대로 저장
  if (items.length) {
    const { error } = await a.svc
      .from('schedule_tags')
      .upsert(items.map((x, i) => ({ kind, key: x.key, label: x.label, color: x.color ?? null, position: i + 1 })), { onConflict: 'kind,key' });
    if (error) return dbError(error);
  }
  return NextResponse.json({ ok: true, items, removed: removed.length });
}
