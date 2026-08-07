import { NextResponse } from 'next/server';
import { purchaseRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { readShares, writeShares, type GardenShare } from '@/lib/garden-share';

// 발주 기록 1건 → 공유 링크 생성: { recordId }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { recordId } = await req.json();
  const record = (await purchaseRecords.readAll()).find((r) => r.id === recordId);
  if (!record) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 });
  if (record.chosenPrice == null)
    return NextResponse.json({ error: '책정 판매가가 없는 기록입니다.' }, { status: 400 });

  const store = await readShares();
  // 같은 기록 재공유 시 기존 링크 재사용(링크 난립 방지)
  let share = store.shares.find((s) => s.decidedAt === record.createdAt && s.bean === record.bean);
  if (!share) {
    const created: GardenShare = {
      token: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      bean: record.bean,
      price: record.chosenPrice,
      decidedAt: record.createdAt,
      createdAt: new Date().toISOString(),
      createdBy: user.email ?? '',
    };
    store.shares = [...store.shares, created];
    await writeShares(store);
    await logActivity(
      supabase,
      user,
      '가든서비스 판매가 공유',
      `${created.bean} · ${created.price.toLocaleString()}원`
    );
    share = created;
  }

  const origin = new URL(req.url).origin;
  return NextResponse.json({ url: `${origin}/s/${share.token}` });
}
