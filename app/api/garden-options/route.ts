import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { GardenOptions, PurchaseStore } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';

// 발주 입력 드롭다운 명단(스탭이름·로스팅사) — 설정에서 관리, 발주 화면에서 선택
const DATA_PATH = 'data/garden-options.json';
const PURCHASES_PATH = 'data/purchases.json';

const clean = (arr: unknown): string[] =>
  Array.isArray(arr)
    ? Array.from(new Set(arr.map((v) => String(v).trim()).filter(Boolean)))
    : [];

async function readOptions(): Promise<GardenOptions | null> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return null;
  try {
    const j = JSON.parse(await new Response(res.stream).text());
    return { staffNames: clean(j.staffNames), roasteries: clean(j.roasteries) };
  } catch {
    return null;
  }
}

async function writeOptions(options: GardenOptions) {
  await put(DATA_PATH, JSON.stringify(options), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// 최초 1회 — 기존 발주 기록에 저장된 스탭이름·로스팅사로 명단을 시딩
async function seedFromPurchases(): Promise<GardenOptions> {
  const res = await get(PURCHASES_PATH, { access: 'private', useCache: false });
  if (!res) return { staffNames: [], roasteries: [] };
  try {
    const store = JSON.parse(await new Response(res.stream).text()) as PurchaseStore;
    const sorted = store.records.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      staffNames: clean(sorted.map((r) => r.staffName).filter(Boolean)),
      roasteries: clean(sorted.map((r) => r.roastery).filter(Boolean)),
    };
  } catch {
    return { staffNames: [], roasteries: [] };
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  let options = await readOptions();
  if (!options) {
    options = await seedFromPurchases();
    await writeOptions(options);
  }
  return NextResponse.json(options);
}

// 명단 전체 교체: { staffNames: string[], roasteries: string[] }
export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const options: GardenOptions = {
    staffNames: clean(body.staffNames),
    roasteries: clean(body.roasteries),
  };
  await writeOptions(options);
  return NextResponse.json(options);
}
