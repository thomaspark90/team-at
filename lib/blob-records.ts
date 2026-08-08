import { del, get, list, put } from '@vercel/blob';
import type { GrindMeasurement } from '@/lib/grind-measurements';
import type { PurchaseRecord, DripRecipe } from '@/lib/types';
import type { GardenTodo } from '@/lib/garden-todos';
import type { AlignmentEvent } from '@/lib/grinder-alignments';

// 컬렉션 저장 구조 — 기록 1건 = blob 1개 (data/<name>/records/<id>.json).
// 기존 단일 JSON(전체 배열을 읽고-고쳐-다시쓰기)은 두 지점이 동시에 저장하면
// 나중 쓰기가 먼저 쓰기를 덮어 기록이 조용히 유실되는 문제가 있었다.
// 기록별 blob은 동시 저장이 서로 다른 파일에 쓰이므로 유실이 구조적으로 없다.
// 기존 단일 JSON 데이터는 최초 readAll 때 1회 기록별로 이관한다(원본 파일은 백업으로 유지).

interface BlobRecord {
  id: string;
  createdAt?: string; // 정렬용 — 없는 구 기록도 sorted()가 방어한다
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
  normalize?: (record: T) => T; // 이관·저장 직전 보정 — 구 기록에 id 가 없는 컬렉션(레시피)의 id 주입용
}) {
  const prefix = `data/${opts.name}/records/`;
  const pathOf = (id: string) => `${prefix}${id}.json`;
  const norm = (r: T) => (opts.normalize ? opts.normalize(r) : r);

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
    const r = norm(record);
    await put(pathOf(r.id), JSON.stringify(r), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  };

  // 정렬: 구 단일 파일의 append 순서와 동일하게 오래된 순. createdAt 이 없는 기록도 죽지 않게 방어.
  const sorted = (records: T[]) =>
    records.sort(
      (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || (a.id ?? '').localeCompare(b.id ?? '')
    );

  // 구 단일 파일이 없다고 확인되면 인스턴스 수명 동안 다시 조회하지 않는다 —
  // 이관이 끝난 지 오래인데 readAll마다 blob GET 1회(항상 miss)를 내는 것 방지.
  // 콜드 스타트마다 초기화되므로, 만에 하나 파일이 재등장해도 새 인스턴스가 잡는다.
  let legacyGone = false;

  const readAll = async (): Promise<T[]> => {
    // 이관 여부는 "기록 blob 개수"가 아니라 "구 단일 파일이 남아 있는지"로 판단한다.
    // 개수로 판단하면 (1) 기록을 전부 지운 뒤 조회할 때 삭제한 기록이 되살아나고,
    // (2) 이관이 중간에 실패하면 일부만 남은 상태가 완료로 오인돼 나머지가 영영 사라진다.
    const legacy = legacyGone ? null : await readJson<Record<string, unknown>>(opts.legacyPath);
    if (!legacy) legacyGone = true;
    if (legacy) {
      const arr = (Array.isArray(legacy[opts.legacyKey]) ? (legacy[opts.legacyKey] as T[]) : []).map(norm);
      // 같은 id·경로라 여러 번 실행돼도 멱등. 중간에 실패하면 원본이 남아 다음 요청이 다시 시도한다.
      if (arr.length > 0) await inChunks(arr, writeOne);
      // 전부 옮긴 뒤에만 원본을 백업으로 넘기고 제거 — 이후 재이관이 일어나지 않는다
      await put(`data/${opts.name}.legacy-backup.json`, JSON.stringify(legacy), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      await del(opts.legacyPath);
      // 방금 쓴 blob 은 목록 인덱스에 아직 안 보일 수 있어, 이관분은 메모리 값을 그대로 돌려준다
      return sorted(arr);
    }
    const paths = await listPaths();
    return sorted((await inChunks(paths, (p) => readJson<T>(p))).filter((r): r is T => r != null));
  };

  // 단건 조회 — 경로 직조회 후, 이관 전 구 기록일 수 있으면 readAll(이관 포함)로 재시도
  const readOne = async (id: string): Promise<T | null> => {
    const rec = await readJson<T>(pathOf(id));
    if (rec) return rec;
    return (await readAll()).find((r) => r.id === id) ?? null;
  };

  const deleteOne = async (id: string): Promise<T | null> => {
    let rec = await readJson<T>(pathOf(id));
    if (!rec) {
      // 아직 이관 전인 구 기록일 수 있음 — readAll이 이관을 수행한 뒤 다시 찾는다
      rec = (await readAll()).find((r) => r.id === id) ?? null;
      if (!rec) return null;
    }
    // 경로가 정확하므로 목록 조회 없이 바로 삭제한다. list 는 인덱스 기반이라 방금 만든
    // blob 이 아직 안 보일 수 있고, 그러면 삭제가 조용히 실패한다.
    await del(pathOf(id));
    return rec;
  };

  return { readAll, readOne, writeOne, deleteOne };
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

export const gardenTodoRecords = blobCollection<GardenTodo>({
  name: 'garden-todos',
  legacyPath: 'data/garden-todos.json',
  legacyKey: 'todos',
});

// 스탭밀 투두 — 가든과 같은 구조, 컬렉션만 분리 (보드·설정 화면이 브랜드별이라 데이터도 분리)
export const staffmealTodoRecords = blobCollection<GardenTodo>({
  name: 'staffmeal-todos',
  legacyPath: 'data/staffmeal-todos.json', // 신설 컬렉션 — 구 단일 JSON 은 처음부터 없다
  legacyKey: 'todos',
});

export const alignmentRecords = blobCollection<AlignmentEvent>({
  name: 'garden-grinder-alignments',
  legacyPath: 'data/garden-grinder-alignments.json',
  legacyKey: 'events',
});

// 레시피는 beanKey+brewType 업서트 구조라 구 기록에 id 가 없다 — 이관·저장 시 주입
export type StoredDripRecipe = DripRecipe & { id: string };
export const dripRecipeRecords = blobCollection<StoredDripRecipe>({
  name: 'garden-recipes',
  legacyPath: 'data/garden-recipes.json',
  legacyKey: 'recipes',
  normalize: (r) => (r.id ? r : { ...r, id: crypto.randomUUID() }),
});
