import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractTransferInfo, breakdownBalance } from '@/lib/finance/transfer';
import { logActivity } from '@/lib/finance/activity';
import { checkAiQuota } from '@/lib/access/rate-limit';
import { notifyGardenEvent } from '@/lib/notify';
import { topicEmails } from '@/lib/garden-notify-topics-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 영수증/명세서 이미지 → Gemini 추출 → 거래처 계좌장부 조회까지 해서 미리보기 반환.
// 등록(저장)은 사용자가 확인창에서 확정한 뒤 /api/finance/transfer POST 로.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const over = await checkAiQuota(supabase, user, '영수증 AI 인식');
  if (over) return over;

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY가 없어요. .env.local에 키를 추가하고 서버를 재시작해주세요.' },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '이미지를 선택하세요.' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요.' }, { status: 400 });
  }

  let extraction;
  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    extraction = await extractTransferInfo(base64, file.type, key);
  } catch (e) {
    return NextResponse.json(
      { error: `이미지를 읽지 못했어요: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  // 계좌장부 조회 — 명세서에 계좌가 없으면 저장된 계좌로 채우고, 있으면 비교용으로 함께 반환
  let savedAccount: { bank: string | null; account_no: string | null; account_holder: string | null } | null = null;
  if (extraction.vendor_name) {
    const { data } = await supabase
      .schema('finance')
      .from('vendor_accounts')
      .select('bank,account_no,account_holder')
      .ilike('vendor_name', extraction.vendor_name)
      .maybeSingle();
    savedAccount = data ?? null;
    if (savedAccount && !extraction.account_no) {
      extraction.bank = extraction.bank ?? savedAccount.bank;
      extraction.account_no = savedAccount.account_no;
      extraction.account_holder = extraction.account_holder ?? savedAccount.account_holder;
    }
  }

  await logActivity(supabase, user, '영수증 AI 인식', extraction.vendor_name ?? '(거래처 미인식)');

  // 우리 항목에 없는 금액이 보이거나 금액 계산이 맞지 않으면 담당자에게 알린다.
  // 돈이 걸린 부분이라 조용히 지나가면 안 되고, 확인창을 닫아버려도 기록이 남아야 한다.
  const bd = breakdownBalance(extraction);
  const mismatch = bd.totalIncludesCurrent === null && bd.current != null && bd.prev != null && bd.total != null;
  const anomalies = [
    ...extraction.other_amounts.map((o) => `${o.label} ${o.amount.toLocaleString()}원`),
    ...(mismatch ? ['금액 합계가 맞지 않음'] : []),
  ];
  if (anomalies.length > 0) {
    try {
      const vendor = extraction.vendor_name ?? '거래처 미인식';
      const lines = [
        `거래처: ${vendor}`,
        extraction.doc_date ? `거래일자: ${extraction.doc_date}` : '',
        extraction.amount != null ? `이번 청구: ${extraction.amount.toLocaleString()}원` : '',
        extraction.prev_balance != null ? `이전 미수: ${extraction.prev_balance.toLocaleString()}원` : '',
        extraction.balance_total != null ? `총잔액: ${extraction.balance_total.toLocaleString()}원` : '',
        `확인 필요: ${anomalies.join(', ')}`,
        bd.note ?? '',
      ].filter(Boolean);
      const emails = await topicEmails(supabase, 'receiptAnomaly');
      await notifyGardenEvent(supabase, {
        emails,
        subject: `[영수증 확인 필요] ${vendor} — ${anomalies[0]}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>명세서에서 확인이 필요한 금액이 보여요.</strong></p>
          ${lines.map((l) => `<p>${l}</p>`).join('')}
          <p>올린 사람: ${(user.email ?? '').split('@')[0]}</p>
          <p><a href="https://team-at-apps.vercel.app/dashboard">송금 요청 화면 열기 →</a></p>
        </div>`,
        push: {
          title: `영수증 확인 필요 · ${vendor}`,
          body: anomalies.join(', ').slice(0, 100),
          url: '/dashboard',
        },
      });
      await logActivity(supabase, user, '영수증 확인 필요 금액', `${vendor} · ${anomalies.join(', ')}`);
    } catch (e) {
      console.error('영수증 이상 금액 알림 실패:', e);
    }
  }

  return NextResponse.json({ extraction, savedAccount, anomalies });
}
