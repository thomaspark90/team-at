import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { serviceClient } from '@/lib/supabase/service';
import { parseTallyPayload, type TallyPayload } from '@/lib/teaching/survey-parse';
import { applySurveyToRoster } from '@/lib/teaching/survey-apply';

export const runtime = 'nodejs';
export const maxDuration = 15;

// 탈리 웹훅 수신 — PUBLIC_API(세션 없음). 서명(tally-signature = base64 HMAC-SHA256(rawBody, TALLY_WEBHOOK_SECRET))으로 자체 인증.
// 응답을 teaching_survey_responses 에 멱등 적재하고, 같은 지점 명부의 동명 스탭(없으면 새 명부 등록)에
// 배우고 싶은 것·순위·메모를 자동 반영한다 → 교육 탭 설문 결과·명부·집계가 사람 손 없이 갱신된다.

function verify(raw: string, header: string | null): boolean {
  const secret = process.env.TALLY_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get('tally-signature'))) {
    return NextResponse.json({ error: '서명 불일치' }, { status: 401 });
  }
  let payload: TallyPayload;
  try {
    payload = JSON.parse(raw) as TallyPayload;
  } catch {
    return NextResponse.json({ error: 'JSON 아님' }, { status: 400 });
  }
  const parsed = parseTallyPayload(payload);
  if ('error' in parsed) return NextResponse.json({ ok: false, skipped: parsed.error });

  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const now = new Date().toISOString();
  const { data: row, error } = await svc
    .from('teaching_survey_responses')
    .upsert(
      {
        store: parsed.store,
        form_id: parsed.formId,
        submission_id: parsed.submissionId,
        respondent_name: parsed.name,
        submitted_at: parsed.submittedAt,
        topics: parsed.topics,
        custom: parsed.custom,
        priorities: parsed.priorities.map((p) => p ?? ''),
        note: parsed.note,
        raw: payload,
        updated_at: now,
      },
      { onConflict: 'submission_id' },
    )
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 명부 자동 반영 — 실패해도 적재는 끝났으므로 200 (탈리 재시도 방지), 결과만 응답에 싣는다
  const applied = await applySurveyToRoster(svc, parsed, 'tally-webhook').catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  if ('userId' in applied) await svc.from('teaching_survey_responses').update({ applied_user_id: applied.userId }).eq('id', row.id);
  return NextResponse.json({ ok: true, id: row.id, applied });
}
