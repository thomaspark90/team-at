import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { AlignmentEvent } from '@/lib/grinder-alignments';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';

const DATA_PATH = 'data/garden-grinder-alignments.json';
const STORE_IDS = STORES.map((s) => s.id);

async function readStore(): Promise<{ events: AlignmentEvent[] }> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { events: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as { events: AlignmentEvent[] };
  } catch {
    return { events: [] };
  }
}

async function writeStore(store: { events: AlignmentEvent[] }) {
  await put(DATA_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const store = await readStore();
  return NextResponse.json(store.events);
}

// 얼라인먼트 1건 기록: { store, date: 'YYYY-MM-DD', memo? }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const storeId = body.store as StoreId;
  if (!STORE_IDS.includes(storeId)) {
    return NextResponse.json({ error: '지점 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  const date = String(body.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 });
  }

  const event: AlignmentEvent = {
    id: crypto.randomUUID(),
    store: storeId,
    date,
    memo: body.memo ? String(body.memo).trim() : undefined,
    createdAt: new Date().toISOString(),
    createdBy: user.email ?? '',
  };

  const data = await readStore();
  data.events.push(event);
  await writeStore(data);

  const label = STORES.find((s) => s.id === storeId)?.label ?? storeId;
  await logActivity(supabase, user, '가든서비스 그라인더 얼라인먼트 기록', `${label} · ${date}${event.memo ? ` · ${event.memo}` : ''}`);
  return NextResponse.json(data.events);
}

// 기록 삭제: ?id=<uuid>
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const data = await readStore();
  const target = data.events.find((e) => e.id === id);
  if (!target) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 });
  data.events = data.events.filter((e) => e.id !== id);
  await writeStore(data);

  const label = STORES.find((s) => s.id === target.store)?.label ?? target.store;
  await logActivity(supabase, user, '가든서비스 그라인더 얼라인먼트 기록 삭제', `${label} · ${target.date}`);
  return NextResponse.json(data.events);
}
