'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { defaultStoreOffsets, type StoreOffsets } from '@/lib/garden/store-price';

// 판교 가격 산식표(/api/garden-store-price) 클라이언트 공유 상태.
// 장부 줄·원두 카드·판매가 블록·산식표가 같은 값을 보도록 모듈 하나에 두고, 산식표에서 고치면 전부 바로 따라온다.
// 불러오기 전·실패 시에는 기본 구간(lib/garden/store-price)으로 보여준다.

let offsets: StoreOffsets = defaultStoreOffsets();
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => offsets;
const loadedSnapshot = () => loaded;

/** 지금 값 — 이벤트 핸들러에서 최신 상태에 이어 붙일 때 */
export const getStoreOffsets = (): StoreOffsets => offsets;

/** 산식표 값을 바꾼다 — 구독 중인 화면이 모두 다시 그려진다 */
export function setStoreOffsets(next: StoreOffsets) {
  offsets = next;
  listeners.forEach((fn) => fn());
}

/** 서버에서 다시 읽는다 — force 가 아니면 한 번만 */
export function loadStoreOffsets(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = fetch('/api/garden-store-price', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j?.offsets) offsets = j.offsets;
      loaded = true;
      listeners.forEach((fn) => fn());
    })
    .catch(() => {
      loading = null; // 실패는 캐시하지 않는다 — 다음 마운트가 다시 시도
    });
  return loading;
}

/** 판교 차액표 — 첫 사용 시 서버에서 불러온다 */
export function useStoreOffsets(): StoreOffsets {
  const v = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void loadStoreOffsets();
  }, []);
  return v;
}

/** 서버 값을 한 번이라도 받아 왔는지 — 받기 전에는 편집을 막는다 */
export function useStoreOffsetsLoaded(): boolean {
  return useSyncExternalStore(subscribe, loadedSnapshot, loadedSnapshot);
}
