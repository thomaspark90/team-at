import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { STORES } from '@/lib/types';
import type { CalibrationCheck, CheckStatus } from '@/lib/calibration-checks';
import { periodOf } from '@/lib/calibration-checks';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';

const DATA_PATH = 'data/garden-calibration-checks.json';
const STATUSES: CheckStatus[] = ['todo', 'doing', 'done'];

async function readStore(): Promise<{ checks: CalibrationCheck[] }> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { checks: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as { checks: CalibrationCheck[] };
  } catch {
    return { checks: [] };
  }
}

async function writeStore(store: { checks: CalibrationCheck[] }) {
  await put(DATA_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// 현재 반월(전반/후반) 체크가 없으면 지점별로 자동 생성해서 돌려준다
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const data = await readStore();
  const { key, label } = periodOf(new Date());
  let seeded = false;
  for (const s of STORES) {
    if (!data.checks.some((c) => c.period === key && c.store === s.id)) {
      data.checks.push({
        id: crypto.randomUUID(),
        period: key,
        periodLabel: label,
        store: s.id,
        status: 'todo',
      });
      seeded = true;
    }
  }
  if (seeded) await writeStore(data);
  return NextResponse.json(data.checks);
}

// 상태 이동/메모: { id, status?, memo? }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const id = String(body.id ?? '');
  const data = await readStore();
  const check = data.checks.find((c) => c.id === id);
  if (!check) return NextResponse.json({ error: '체크 항목을 찾을 수 없습니다.' }, { status: 404 });

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: '상태 값이 올바르지 않습니다.' }, { status: 400 });
    }
    check.status = body.status as CheckStatus;
  }
  if (body.memo !== undefined) check.memo = String(body.memo).trim() || undefined;
  check.updatedAt = new Date().toISOString();
  check.updatedBy = user.email ?? '';
  await writeStore(data);

  const label = STORES.find((s) => s.id === check.store)?.label ?? check.store;
  await logActivity(
    supabase,
    user,
    '가든서비스 드리프트 체크 갱신',
    `${check.periodLabel} · ${label} · ${check.status}${check.memo ? ` · ${check.memo}` : ''}`
  );
  return NextResponse.json(data.checks);
}
