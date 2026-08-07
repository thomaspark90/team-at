import { get, put } from '@vercel/blob';
import { APP_URL } from '@/lib/app-url';
import { NextResponse } from 'next/server';
import { STORES } from '@/lib/types';
import type { CalibrationCheck, CheckStatus } from '@/lib/calibration-checks';
import { periodOf, BASELINE_UM, BASELINE_DATE, DRIFT_TOLERANCE_UM, memoMicron } from '@/lib/calibration-checks';
import { latestAlignmentDate, type AlignmentEvent } from '@/lib/grinder-alignments';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { notifyGardenEvent } from '@/lib/notify';
import { topicEmails } from '@/lib/garden-notify-topics-server';
import { requireGardenTab } from '@/lib/access/guard';

const DATA_PATH = 'data/garden-calibration-checks.json';
const ALIGN_PATH = 'data/garden-grinder-alignments.json';
const STATUSES: CheckStatus[] = ['todo', 'doing', 'done'];

async function readAlignments(): Promise<AlignmentEvent[]> {
  const res = await get(ALIGN_PATH, { access: 'private', useCache: false });
  if (!res) return [];
  try {
    const parsed = JSON.parse(await new Response(res.stream).text()) as { events?: AlignmentEvent[] };
    return parsed.events ?? [];
  } catch {
    return [];
  }
}

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
  {
    const denied = await requireGardenTab(supabase, user, ['dashboard', 'calibration']);
    if (denied) return denied;
  }

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
  {
    const denied = await requireGardenTab(supabase, user, ['dashboard', 'calibration']);
    if (denied) return denied;
  }

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

  // 완료 전환 시 캘리브레이션 담당자에게 알림 — 메모의 측정값이 기준선 ±30µm를
  // 벗어나면 드리프트 경고로 승격. 완료 처리자 본인은 수신 제외. 실패해도 저장은 유지.
  if (body.status === 'done') {
    try {
      const me = (user.email ?? '').toLowerCase();
      const emails = (await topicEmails(supabase, 'calibration')).filter((e) => e !== me);
      const um = memoMicron(check.memo);
      // 기준선(07-16) 이후 해당 지점 얼라인이 있었으면 그라인더 상태가 바뀐 것 —
      // 낡은 기준선과 비교해 오경보를 내지 않고 판정을 보류한다.
      const lastAlign = latestAlignmentDate(await readAlignments(), check.store);
      const baselineValid = !lastAlign || lastAlign <= BASELINE_DATE;
      const base = BASELINE_UM[check.store];
      const drift = um != null && baselineValid ? Math.round((um - base) * 10) / 10 : null;
      const isDrift = drift != null && Math.abs(drift) > DRIFT_TOLERANCE_UM;
      const by = me.split('@')[0];
      const head = isDrift ? '⚠ 드리프트 감지' : '드리프트 체크 완료';
      const driftLine =
        drift != null
          ? `측정 ${um}µm — 기준선 ${base}µm 대비 ${drift > 0 ? '+' : ''}${drift}µm ${isDrift ? '(허용 ±' + DRIFT_TOLERANCE_UM + 'µm 초과, 재캘리브레이션 검토)' : '(정상 범위)'}`
          : um != null && !baselineValid
            ? `측정 ${um}µm — ${lastAlign} 재얼라인 이후 새 기준선 미설정, 드리프트 판정 보류`
            : check.memo ?? '';
      await notifyGardenEvent(supabase, {
        emails,
        subject: `[${head}] ${label} · ${check.periodLabel}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>${label} EK43 — ${head}</strong> (${check.periodLabel})</p>
          <p>${driftLine}</p>
          ${check.memo ? `<p>메모: ${check.memo}</p>` : ''}
          ${by ? `<p>완료: ${by}</p>` : ''}
          <p><a href="${APP_URL}/garden">가든 대시보드 열기 →</a></p>
        </div>`,
        push: {
          title: `${head} · ${label}`,
          body: driftLine || `${check.periodLabel} 체크 완료${by ? ` — ${by}` : ''}`,
          url: '/garden',
        },
      });
    } catch (e) {
      console.error('드리프트 체크 알림 실패:', e);
    }
  }
  return NextResponse.json(data.checks);
}
