import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { PurchaseRecord, PurchaseStore } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';

const DATA_PATH = 'data/purchases.json';

async function readStore(): Promise<PurchaseStore> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { records: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as PurchaseStore;
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: PurchaseStore) {
  await put(DATA_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store.records);
}

// 발주 기록 추가: { bean, purchasePrice, settings, costPerCup, rangeLow, rangeHigh }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const store = await readStore();
  const record: PurchaseRecord = {
    id: `${Date.now()}`,
    createdAt: new Date().toISOString(),
    bean: body.bean,
    purchasePrice: body.purchasePrice,
    settings: body.settings,
    costPerCup: body.costPerCup,
    rangeLow: body.rangeLow,
    rangeHigh: body.rangeHigh,
    chosenMult: body.chosenMult ?? null,
    chosenPrice: body.chosenPrice ?? null,
  };
  store.records = [...store.records, record];
  await writeStore(store);
  await logActivity(
    supabase,
    user,
    '가든서비스 발주 기록',
    `${record.bean} · 매입 ${Number(record.purchasePrice).toLocaleString()}원` +
      (record.chosenPrice != null ? ` · 판매가 ${Number(record.chosenPrice).toLocaleString()}원` : '')
  );
  return NextResponse.json(record);
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await req.json();
  const store = await readStore();
  const removed = store.records.find((r) => r.id === id);
  store.records = store.records.filter((r) => r.id !== id);
  await writeStore(store);
  await logActivity(supabase, user, '가든서비스 발주 삭제', removed ? removed.bean : null);
  return NextResponse.json({ ok: true });
}
