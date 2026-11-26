// 서버 전용 — 원두가 그 지점에서 '대기 중'(판매 전)인지. 클라이언트에서 import 금지.
import { get } from '@vercel/blob';
import type { BeanMetaStore, StoreId } from '@/lib/types';

const DATA_PATH = 'data/garden-beans.json'; // 원두 메타(노트 · 재고 · 아카이브 · 판매 대기 지점) — 쓰기는 /api/garden-beans

/** 대기 중이면 true. 메타를 못 읽으면 false(판매 중으로 본다) — 평가 저장을 막지 않는다. */
export async function isBeanWaiting(beanKey: string, store: StoreId): Promise<boolean> {
  try {
    const res = await get(DATA_PATH, { access: 'private', useCache: false });
    if (!res) return false;
    const j = JSON.parse(await new Response(res.stream).text()) as BeanMetaStore;
    return !!j.beans?.find((b) => b.beanKey === beanKey)?.waitingStores?.includes(store);
  } catch {
    return false;
  }
}
