import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/finance/activity';
import { sanitizeItem, type NametagCatalog, type NametagItem } from '@/lib/garden/nametags';
import { badRequest, nametagRequests, printRecipients, readCatalog, requireNametagActor, writeCatalog } from '@/lib/garden/nametags-server';

export const runtime = 'nodejs';

const RECENT = 30; // 화면에 보여주는 최근 요청 수

// 브런치 네임택 — GET: 메뉴 목록 + 최근 요청(네임택 탭). POST/PATCH/DELETE: 메뉴 추가·수정·삭제(관리 탭).
export async function GET() {
  const a = await requireNametagActor();
  if (a instanceof NextResponse) return a;
  try {
    const [catalog, all, recipients] = await Promise.all([readCatalog(), nametagRequests.readAll(), printRecipients(a.supabase)]);
    const requests = all.slice(-RECENT).reverse();
    // recipients — 요청하면 알림을 받을 사람(이름·연락처). 스탭이 보내기 전에 누구에게 가는지 본다.
    return NextResponse.json({ catalog, requests, recipients, canManage: a.canManage, me: a.user.email ?? '' });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** 카테고리 결정 — 기존 id 또는 새 이름(categoryLabel). 새 이름이면 카탈로그에 추가한다. */
function resolveCategory(catalog: NametagCatalog, b: Record<string, unknown>): string | null {
  const label = typeof b.categoryLabel === 'string' ? b.categoryLabel.trim().slice(0, 30) : '';
  if (label) {
    const same = catalog.categories.find((c) => c.label === label);
    if (same) return same.id;
    const id = `c-${crypto.randomUUID().slice(0, 8)}`;
    catalog.categories.push({ id, label });
    return id;
  }
  return catalog.categories.some((c) => c.id === b.category) ? (b.category as string) : null;
}

export async function POST(req: Request) {
  const a = await requireNametagActor(true);
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields = sanitizeItem(b);
  if (typeof fields === 'string') return badRequest(fields);
  const catalog = structuredClone(await readCatalog());
  const category = resolveCategory(catalog, b);
  if (!category) return badRequest('카테고리를 골라주세요.');
  const last = Math.max(-1, ...catalog.items.filter((i) => i.category === category).map((i) => i.order));
  const item: NametagItem = { id: crypto.randomUUID(), category, order: last + 1, ...fields };
  catalog.items.push(item);
  const saved = await writeCatalog(catalog);
  await logActivity(a.supabase, a.user, '가든서비스 네임택 메뉴 추가', item.ko.replace(/\n/g, ' '));
  return NextResponse.json({ catalog: saved, item });
}

export async function PATCH(req: Request) {
  const a = await requireNametagActor(true);
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const catalog = structuredClone(await readCatalog());
  const idx = catalog.items.findIndex((i) => i.id === b.id);
  if (idx < 0) return badRequest('메뉴를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  const fields = sanitizeItem(b);
  if (typeof fields === 'string') return badRequest(fields);
  const category = resolveCategory(catalog, b);
  if (!category) return badRequest('카테고리를 골라주세요.');
  const prev = catalog.items[idx];
  const order =
    category === prev.category ? prev.order : Math.max(-1, ...catalog.items.filter((i) => i.category === category).map((i) => i.order)) + 1;
  catalog.items[idx] = { ...prev, ...fields, category, order };
  const saved = await writeCatalog(catalog);
  await logActivity(a.supabase, a.user, '가든서비스 네임택 메뉴 수정', fields.ko.replace(/\n/g, ' '));
  return NextResponse.json({ catalog: saved, item: catalog.items[idx] });
}

export async function DELETE(req: Request) {
  const a = await requireNametagActor(true);
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const catalog = structuredClone(await readCatalog());
  const item = catalog.items.find((i) => i.id === b.id);
  if (!item) return badRequest('메뉴를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  catalog.items = catalog.items.filter((i) => i.id !== item.id);
  const saved = await writeCatalog(catalog);
  await logActivity(a.supabase, a.user, '가든서비스 네임택 메뉴 삭제', item.ko.replace(/\n/g, ' '));
  return NextResponse.json({ catalog: saved, item });
}
