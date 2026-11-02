import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { notifyGardenEvent } from '@/lib/notify';
import { OWNER_EMAIL } from '@/lib/finance/access';
import { APP_URL } from '@/lib/app-url';
import { purchaseRecords } from '@/lib/blob-records';
import { kakaoNotifyJobs, readKakaoRooms } from '@/lib/kakao-notify';
import { fmtDate } from '@/lib/garden/format';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 발주 카톡 미전송 리마인드 크론(12·18·20시 KST = 03·09·11시 UTC, vercel.json crons) — 2026-11-03 대표 지시.
// 판교 원두는 [발주] 버튼이 안 보이는 스탭이 저장하므로, 대표가 판매가 설정에서 [발주]를 누를 때까지 메일로 알린다.
// 대상: 카톡방이 매핑된 로스터리 · 대기/전송 완료 잡이 없음 · 최근 3일 안 저장(그 뒤엔 직접 보낸 것으로 보고 멈춤).
// 도입 이전 기록은 제외(CUTOFF) — 지난 발주가 한꺼번에 쌓여 오지 않게. 인증은 CRON_SECRET Bearer.
const CUTOFF = '2026-11-03T00:00:00+09:00';
const WINDOW_MS = 3 * 24 * 3600_000;
const STORE_NAME: Record<string, string> = { pangyo: '판교점', yangjae: '양재천점' };
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY 설정 필요' }, { status: 500 });

  const [records, jobs, rooms] = await Promise.all([purchaseRecords.readAll(), kakaoNotifyJobs.readAll(), readKakaoRooms()]);
  const done = new Set(jobs.filter((j) => j.status === 'pending' || j.status === 'sent').map((j) => j.purchaseId));
  const now = Date.now();
  const cutoff = new Date(CUTOFF).getTime();
  const waiting = records
    .filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= cutoff && now - t <= WINDOW_MS && !!r.roastery && !!rooms[r.roastery] && !done.has(r.id);
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (waiting.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const items = waiting
    .map((r) => {
      const g = r.settings?.capacityG;
      const amount = g ? (g % 1000 === 0 ? `${g / 1000}kg` : `${g}g`) : '';
      const lines = [
        `<strong>${r.bean}</strong>${amount ? ` · ${amount}` : ''}`,
        `${r.roastery} → 카톡방 「${rooms[r.roastery!]}」`,
        `받을 지점: ${r.store ? STORE_NAME[r.store] : '미지정'} · 발주 저장: ${fmtDate(r.orderDate ?? r.createdAt)}${r.staffName ? ` · ${r.staffName}님` : ''}`,
        `매입 ${won(r.purchasePrice)} · 재료비 ${won(r.costPerCup)} · ${r.chosenPrice != null ? `판매가 ${won(r.chosenPrice)} 책정됨` : '판매가 미책정'}`,
      ];
      return `<li style="margin-bottom:10px">${lines.join('<br>')}</li>`;
    })
    .join('');
  const first = waiting[0].bean;
  const subject = `[발주 카톡 대기 ${waiting.length}건] ${first}${waiting.length > 1 ? ` 외 ${waiting.length - 1}건` : ''}`;
  await notifyGardenEvent(svc, {
    emails: [OWNER_EMAIL],
    subject,
    html: `
    <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
      <p>아직 로스터리 카톡방에 발주 메시지를 보내지 않은 원두예요. 판매가 설정 화면에서 [발주]를 눌러 주세요.</p>
      <ul style="padding-left:18px">${items}</ul>
      <p><a href="${APP_URL}/garden/saleprice">판매가 설정 열기 →</a></p>
      <p style="color:#888;font-size:12px">12·18·20시에 확인해 보내요. [발주]를 누르면(또는 저장 후 3일이 지나면) 더 오지 않아요.</p>
    </div>`,
    push: {
      title: `발주 카톡 대기 ${waiting.length}건`,
      body: waiting.map((r) => r.bean).join(', '),
      url: '/garden/saleprice',
    },
  });
  return NextResponse.json({ ok: true, sent: waiting.length });
}
