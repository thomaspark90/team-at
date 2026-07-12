import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { BeanMeta, BeanMetaStore } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';

const DATA_PATH = 'data/garden-beans.json';

async function readStore(): Promise<BeanMetaStore> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { beans: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as BeanMetaStore;
  } catch {
    return { beans: [] };
  }
}

async function writeStore(store: BeanMetaStore) {
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
  return NextResponse.json(store.beans);
}

// 원두 메타 업서트: { beanKey, bean, tasting?, status? } — 안 보낸 필드는 기존 값 유지.
// 노트도 없고 판매 중(active)이면 엔트리 자체를 제거.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  if (!body.beanKey || !body.bean) {
    return NextResponse.json({ error: '원두 정보가 없습니다.' }, { status: 400 });
  }

  const store = await readStore();
  const prev = store.beans.find((b) => b.beanKey === body.beanKey);
  const tasting = body.tasting !== undefined ? String(body.tasting).trim() : prev?.tasting ?? '';
  const status =
    body.status === 'soldout' || body.status === 'active' ? body.status : prev?.status ?? 'active';
  const rest = store.beans.filter((b) => b.beanKey !== body.beanKey);
  if (tasting || status === 'soldout') {
    const meta: BeanMeta = {
      beanKey: body.beanKey,
      bean: body.bean,
      tasting,
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email ?? '',
    };
    store.beans = [...rest, meta];
  } else {
    store.beans = rest;
  }
  await writeStore(store);
  await logActivity(
    supabase,
    user,
    body.status !== undefined
      ? `가든서비스 원두 ${status === 'soldout' ? '소진 처리' : '판매 재개'}`
      : tasting
        ? '가든서비스 테이스팅 노트 저장'
        : '가든서비스 테이스팅 노트 삭제',
    body.bean
  );
  return NextResponse.json({ ok: true });
}
