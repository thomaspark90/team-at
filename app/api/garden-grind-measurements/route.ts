import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GrindMeasurement, RoastLevel } from '@/lib/grind-measurements';
import { ROAST_LEVELS } from '@/lib/grind-measurements';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { notifyGardenEvent } from '@/lib/notify';
import { topicEmails } from '@/lib/garden-notify-topics-server';

const DATA_PATH = 'data/garden-grind-measurements.json';
const STORE_IDS = STORES.map((s) => s.id);
const ROAST_IDS = ROAST_LEVELS.map((r) => r.id);

async function readStore(): Promise<{ measurements: GrindMeasurement[] }> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { measurements: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as { measurements: GrindMeasurement[] };
  } catch {
    return { measurements: [] };
  }
}

async function writeStore(store: { measurements: GrindMeasurement[] }) {
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
  return NextResponse.json(store.measurements);
}

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// 측정 1건 추가: { store, bean, roast?, dial, imageUrls, mean?, std?, fines?, shareUrl?, memo? }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const storeId = body.store as StoreId;
  if (!STORE_IDS.includes(storeId)) {
    return NextResponse.json({ error: '지점 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  const bean = String(body.bean ?? '').trim();
  if (!bean) return NextResponse.json({ error: '원두명을 입력해주세요.' }, { status: 400 });
  const dial = Number(body.dial);
  if (!Number.isFinite(dial) || dial < 0 || dial > 13) {
    return NextResponse.json({ error: 'EK43 다이얼은 0~13 사이여야 합니다.' }, { status: 400 });
  }
  const imageUrls = (Array.isArray(body.imageUrls) ? body.imageUrls : [])
    .map((u: unknown) => String(u))
    .filter((u: string) => u.startsWith('https://'));

  const measurement: GrindMeasurement = {
    id: crypto.randomUUID(),
    store: storeId,
    bean,
    roast: ROAST_IDS.includes(body.roast) ? (body.roast as RoastLevel) : undefined,
    dial,
    imageUrls,
    mean: num(body.mean),
    std: num(body.std),
    fines: num(body.fines),
    shareUrl: body.shareUrl ? String(body.shareUrl).trim() : undefined,
    memo: body.memo ? String(body.memo).trim() : undefined,
    createdAt: new Date().toISOString(),
    createdBy: user.email ?? '',
  };

  const data = await readStore();
  data.measurements.push(measurement);
  await writeStore(data);

  const label = STORES.find((s) => s.id === storeId)?.label ?? storeId;
  const summary =
    `${label} · ${bean} · 다이얼 ${dial}` +
    (measurement.mean ? ` · 평균 ${measurement.mean}µm` : '') +
    ` · 이미지 ${imageUrls.length}장`;
  await logActivity(supabase, user, '가든서비스 분쇄도 측정 업로드', summary);

  // 측정 업로드 완료 → 캘리브레이션 담당자에게 알림(업로더 본인 제외) — 요청→수행→확인 루프 닫기.
  // 실패해도 업로드는 유지.
  try {
    const me = (user.email ?? '').toLowerCase();
    const emails = (await topicEmails(supabase, 'calibration')).filter((e) => e !== me);
    const by = me.split('@')[0];
    await notifyGardenEvent(supabase, {
      emails,
      subject: `[분쇄도 업로드] ${label} · ${bean} · 다이얼 ${dial}`,
      html: `
      <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
        <p><strong>분쇄도 측정이 업로드됐어요</strong></p>
        <p>${summary}</p>
        ${by ? `<p>업로드: ${by}</p>` : ''}
        <p><a href="https://team-at-apps.vercel.app/garden/calibration">분쇄도 측정 열기 →</a></p>
      </div>`,
      push: {
        title: `분쇄도 업로드 · ${label}`,
        body: `${bean} · 다이얼 ${dial}${measurement.mean ? ` · 평균 ${measurement.mean}µm` : ''}${by ? ` — ${by}` : ''}`,
        url: '/garden/calibration',
      },
    });
  } catch (e) {
    console.error('측정 업로드 알림 실패:', e);
  }
  return NextResponse.json(data.measurements);
}

// 측정 삭제: ?id=<uuid>
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const data = await readStore();
  const target = data.measurements.find((m) => m.id === id);
  if (!target) return NextResponse.json({ error: '측정 기록을 찾을 수 없습니다.' }, { status: 404 });
  data.measurements = data.measurements.filter((m) => m.id !== id);
  await writeStore(data);

  const label = STORES.find((s) => s.id === target.store)?.label ?? target.store;
  await logActivity(supabase, user, '가든서비스 분쇄도 측정 삭제', `${label} · ${target.bean} · 다이얼 ${target.dial}`);
  return NextResponse.json(data.measurements);
}
