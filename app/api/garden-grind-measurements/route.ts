import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/app-url';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GrindMeasurement, RoastLevel } from '@/lib/grind-measurements';
import { ROAST_LEVELS } from '@/lib/grind-measurements';
import { grindMeasurementRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { notifyGardenEvent } from '@/lib/notify';
import { topicEmails } from '@/lib/garden-notify-topics-server';
import { requireGardenTab } from '@/lib/access/guard';

const STORE_IDS = STORES.map((s) => s.id);
const ROAST_IDS = ROAST_LEVELS.map((r) => r.id);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'calibration');
    if (denied) return denied;
  }

  return NextResponse.json(await grindMeasurementRecords.readAll());
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
  {
    const denied = await requireGardenTab(supabase, user, 'calibration');
    if (denied) return denied;
  }

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

  // id는 클라이언트가 미리 만들어 보낼 수 있다 — 수치를 이미지 업로드 전에 먼저 저장하고
  // (2026-08-08 대표 지적: 이미지 업로드가 느려 저장 버튼이 오래 막혀 있던 문제),
  // 이미지는 백그라운드로 올린 뒤 이 id로 PATCH 해 붙인다. 형식이 아니면 서버가 새로 발급.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clientId = typeof body.id === 'string' && UUID_RE.test(body.id) ? body.id : null;

  const measurement: GrindMeasurement = {
    id: clientId ?? crypto.randomUUID(),
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

  await grindMeasurementRecords.writeOne(measurement);

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
        <p><a href="${APP_URL}/garden/calibration">분쇄도 측정 열기 →</a></p>
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
  return NextResponse.json(await grindMeasurementRecords.readAll());
}

// 이미지 붙이기/떼기: { id, imageUrls?, removeImageUrls? }
//   imageUrls — 수치를 먼저 저장(POST)한 뒤 백그라운드 업로드가 끝나면 여기로 붙인다
//     (수치 저장이 이미지 업로드를 기다리지 않게 하는 목적).
//   removeImageUrls — 잘못 올린 이미지 한 장만 골라 지운다(측정 기록 전체는 유지).
// Blob 파일 자체는 지우지 않는다 — 다른 레코드가 같은 URL을 참조할 리는 없지만, 삭제 실수의
// 되돌릴 구석을 남겨두는 편이 안전(용량은 미미).
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'calibration');
    if (denied) return denied;
  }

  const body = await req.json();
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  const toAdd = (Array.isArray(body.imageUrls) ? body.imageUrls : [])
    .map((u: unknown) => String(u))
    .filter((u: string) => u.startsWith('https://'));
  const toRemove = new Set(
    (Array.isArray(body.removeImageUrls) ? body.removeImageUrls : []).map((u: unknown) => String(u)),
  );

  const target = await grindMeasurementRecords.readOne(id);
  if (!target) return NextResponse.json({ error: '측정 기록을 찾을 수 없습니다.' }, { status: 404 });

  const imageUrls = [...target.imageUrls.filter((u) => !toRemove.has(u)), ...toAdd];
  await grindMeasurementRecords.writeOne({ ...target, imageUrls });
  return NextResponse.json(await grindMeasurementRecords.readAll());
}

// 측정 삭제: ?id=<uuid>
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'calibration');
    if (denied) return denied;
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const target = await grindMeasurementRecords.deleteOne(id);
  if (!target) return NextResponse.json({ error: '측정 기록을 찾을 수 없습니다.' }, { status: 404 });

  const label = STORES.find((s) => s.id === target.store)?.label ?? target.store;
  await logActivity(supabase, user, '가든서비스 분쇄도 측정 삭제', `${label} · ${target.bean} · 다이얼 ${target.dial}`);
  return NextResponse.json(await grindMeasurementRecords.readAll());
}
