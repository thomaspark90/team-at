import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { BeanMeta, BeanMetaStore, StoreId } from '@/lib/types';
import { STORES, STOCK_LEVELS, stockOf } from '@/lib/types';
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

// 원두 메타 업서트: { beanKey, bean, tasting?, stockByStore?, soldoutStores? } — 안 보낸 필드는 기존 값 유지.
// stockByStore는 지점 단위 병합(한 지점만 보내도 됨). 노트도 없고 전 지점 재고 100%면 엔트리 제거.
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

  // 현재 재고(구버전 소진 기록 포함)에서 출발해 요청 값을 지점 단위로 병합
  const stockByStore: Partial<Record<StoreId, number>> = {};
  for (const id of STORE_IDS) stockByStore[id] = stockOf(prev, id);
  const stockTouched = body.stockByStore != null && typeof body.stockByStore === 'object';
  if (stockTouched) {
    for (const id of STORE_IDS) {
      const v = Number(body.stockByStore[id]);
      if (body.stockByStore[id] != null && STOCK_LEVELS.includes(v)) stockByStore[id] = v;
    }
  } else if (Array.isArray(body.soldoutStores)) {
    // 구버전 클라이언트 호환 — 소진 배열이 오면 0%/100%로 반영
    for (const id of STORE_IDS) stockByStore[id] = body.soldoutStores.includes(id) ? 0 : 100;
  }

  const allFull = STORE_IDS.every((id) => stockByStore[id] === 100);
  const rest = store.beans.filter((b) => b.beanKey !== body.beanKey);
  if (tasting || !allFull) {
    const meta: BeanMeta = {
      beanKey: body.beanKey,
      bean: body.bean,
      tasting,
      stockByStore,
      // 구버전 호환 — 재고 0% 지점을 소진으로 함께 기록
      soldoutStores: STORE_IDS.filter((id) => stockByStore[id] === 0),
      updatedAt: new Date().toISOString(),
      updatedBy: user.email ?? '',
    };
    store.beans = [...rest, meta];
  } else {
    store.beans = rest;
  }
  await writeStore(store);
  const stockChanged = stockTouched || Array.isArray(body.soldoutStores);
  const stockLabel = STORES.map((s) => `${s.short} ${stockByStore[s.id]}%`).join(' · ');
  await logActivity(
    supabase,
    user,
    stockChanged
      ? '가든서비스 원두 재고량 변경'
      : tasting
        ? '가든서비스 테이스팅 노트 저장'
        : '가든서비스 테이스팅 노트 삭제',
    stockChanged ? `${body.bean} · ${stockLabel}` : body.bean
  );
  return NextResponse.json({ ok: true });
}
