import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import {
  OFFSET_OPTIONS,
  OFFSET_PRICES,
  cleanStoreOffsets,
  defaultStoreOffsets,
  type StoreOffsets,
} from '@/lib/garden/store-price';

// 판교 가격 산식표 — 양재천 기준가(행)별 판교 차액. 판매가(saleprice) 권한 계정이 칸을 눌러 고친다 (2026-11-24)
const DATA_PATH = 'data/garden-store-price-offsets.json';

async function readOffsets(): Promise<StoreOffsets | null> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return null;
  try {
    return cleanStoreOffsets(JSON.parse(await new Response(res.stream).text()).offsets);
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    // 읽기는 판매가가 보이는 화면 전부 — 원두 장부(recipes)·발주(pricing)·판매가(saleprice)
    const denied = await requireGardenTab(supabase, user, ['recipes', 'saleprice', 'pricing']);
    if (denied) return denied;
  }
  return NextResponse.json({ offsets: (await readOffsets()) ?? defaultStoreOffsets() });
}

// 행 하나 변경: { price, offset } — 서버에서 최신 상태에 적용해 동시 편집 시 다른 행을 덮지 않는다
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'saleprice');
    if (denied) return denied;
  }

  const body = await req.json();
  const price = Number(body.price);
  const offset = Number(body.offset);
  if (!OFFSET_PRICES.includes(price) || !OFFSET_OPTIONS.includes(offset)) {
    return NextResponse.json({ error: '표에 없는 칸입니다.' }, { status: 400 });
  }
  const offsets = (await readOffsets()) ?? defaultStoreOffsets();
  offsets[String(price)] = offset;

  await put(DATA_PATH, JSON.stringify({ offsets, updatedAt: new Date().toISOString(), updatedBy: user.email ?? '' }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return NextResponse.json({ offsets });
}
