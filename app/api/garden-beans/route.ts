import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { BeanMeta, BeanMetaStore, StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
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

const STORE_IDS = STORES.map((s) => s.id);
// 구버전 status=soldout은 전 지점 소진으로 해석
const soldOf = (b?: BeanMeta): StoreId[] =>
  b?.soldoutStores ?? (b?.status === 'soldout' ? [...STORE_IDS] : []);

// 원두 메타 업서트: { beanKey, bean, tasting?, soldoutStores? } — 안 보낸 필드는 기존 값 유지.
// 노트도 없고 소진 지점도 없으면 엔트리 자체를 제거.
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
  const soldoutStores = Array.isArray(body.soldoutStores)
    ? (body.soldoutStores.filter((s: unknown) => STORE_IDS.includes(s as StoreId)) as StoreId[])
    : soldOf(prev);
  const rest = store.beans.filter((b) => b.beanKey !== body.beanKey);
  if (tasting || soldoutStores.length > 0) {
    const meta: BeanMeta = {
      beanKey: body.beanKey,
      bean: body.bean,
      tasting,
      soldoutStores,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email ?? '',
    };
    store.beans = [...rest, meta];
  } else {
    store.beans = rest;
  }
  await writeStore(store);
  const soldLabels = STORES.filter((s) => soldoutStores.includes(s.id)).map((s) => s.label);
  await logActivity(
    supabase,
    user,
    body.soldoutStores !== undefined
      ? '가든서비스 원두 소진 상태 변경'
      : tasting
        ? '가든서비스 테이스팅 노트 저장'
        : '가든서비스 테이스팅 노트 삭제',
    body.soldoutStores !== undefined
      ? `${body.bean} · 소진 ${soldLabels.length ? soldLabels.join('·') : '없음(전체 판매 중)'}`
      : body.bean
  );
  return NextResponse.json({ ok: true });
}
