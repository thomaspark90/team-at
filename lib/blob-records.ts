import { del, get, list, put } from '@vercel/blob';
import type { GrindMeasurement } from '@/lib/grind-measurements';
import type { PurchaseRecord } from '@/lib/types';

// 컬렉션 저장 구조 — 기록 1건 = blob 1개 (data/<name>/records/<id>.json).
// 기존 단일 JSON(전체 배열을 읽고-고쳐-다시쓰기)은 두 지점이 동시에 저장하면
// 나중 쓰기가 먼저 쓰기를 덮어 기록이 조용히 유실되는 문제가 있었다.
// 기록별 blob은 동시 저장이 서로 다른 파일에 쓰이므로 유실이 구조적으로 없다.
// 기존 단일 JSON 데이터는 최초 readAll 때 1회 기록별로 이관한다(원본 파일은 백업으로 유지).

interface BlobRecord {
  id: string;
  createdAt: string;
}

const CHUNK = 30; // blob 병렬 요청 상한 — 대량 이관·조회 시 rate limit 보호

async function inChunks<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    out.push(...(await Promise.all(items.slice(i, i + CHUNK).map(fn))));
  }
  return out;
}

async function readJson<V>(path: string): Promise<V | null> {
  const res = await get(path, { access: 'private', useCache: false });
  if (!res) return null;
  try {
    return JSON.parse(await new Response(res.stream).text()) as V;
  } catch {
    return null;
  }
}

export function blobCollection<T extends BlobRecord>(opts: {
  name: string; // 컬렉션 이름 — data/<name>/records/ 아래에 저장
  legacyPath: string; // 구 단일 JSON 경로
  legacyKey: string; // 구 JSON에서 기록 배열이 담긴 키
}) {
  const prefix = `data/${opts.name}/records/`;
  const pathOf = (id: string) => `${prefix}${id}.json`;

  const listPaths = async (): Promise<string[]> => {
    const paths: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor });
      paths.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return paths;
  };

  const writeOne = async (record: T): Promise<void> => {
    await put(pathOf(record.id), JSON.stringify(record), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  };

  const readAll = async (): Promise<T[]> => {
    const paths = await listPaths();
    let records: T[];
    if (paths.length === 0) {
      // 기록별 blob이 아직 없으면 구 단일 JSON에서 이관 — 같은 id·경로라 동시 실행돼도 멱등
      const legacy = await readJson<Record<string, unknown>>(opts.legacyPath);
      const arr = legacy && Array.isArray(legacy[opts.legacyKey]) ? (legacy[opts.legacyKey] as T[]) : [];
      if (arr.length > 0) await inChunks(arr, writeOne);
      records = arr;
    } else {
      records = (await inChunks(paths, (p) => readJson<T>(p))).filter((r): r is T => r != null);
    }
    // 구 단일 파일의 append 순서와 동일하게 오래된 순 정렬
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  };

  const deleteOne = async (id: string): Promise<T | null> => {
    let rec = await readJson<T>(pathOf(id));
    if (!rec) {
      // 아직 이관 전인 구 기록일 수 있음 — readAll이 이관을 수행한 뒤 다시 찾는다
      rec = (await readAll()).find((r) => r.id === id) ?? null;
      if (!rec) return null;
    }
    const page = await list({ prefix: pathOf(id) });
    await Promise.all(page.blobs.map((b) => del(b.url)));
    return rec;
  };

  return { readAll, writeOne, deleteOne };
}

// 앱에서 쓰는 컬렉션 인스턴스 — 라우트들이 공유
export const purchaseRecords = blobCollection<PurchaseRecord>({
  name: 'purchases',
  legacyPath: 'data/purchases.json',
  legacyKey: 'records',
});

export const grindMeasurementRecords = blobCollection<GrindMeasurement>({
  name: 'garden-grind-measurements',
  legacyPath: 'data/garden-grind-measurements.json',
  legacyKey: 'measurements',
});
