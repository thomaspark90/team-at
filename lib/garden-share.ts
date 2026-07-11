import { get, put } from '@vercel/blob';

// 가든서비스 판매가 공유 스냅샷 — 공개 카드엔 판매가만 노출
// (매입가·잔당원가·배수는 역산 가능하므로 제외)
export interface GardenShare {
  token: string;
  bean: string;
  price: number; // 책정 판매가
  decidedAt: string; // 발주 기록 시점 ISO
  createdAt: string; // 공유 생성 시점 ISO
  createdBy: string;
}

export interface ShareStore {
  shares: GardenShare[];
}

const SHARES_PATH = 'data/garden-shares.json';

export async function readShares(): Promise<ShareStore> {
  const res = await get(SHARES_PATH, { access: 'private', useCache: false });
  if (!res) return { shares: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as ShareStore;
  } catch {
    return { shares: [] };
  }
}

export async function writeShares(store: ShareStore) {
  await put(SHARES_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function findShare(token: string): Promise<GardenShare | null> {
  const store = await readShares();
  return store.shares.find((s) => s.token === token) ?? null;
}
