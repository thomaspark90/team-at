import { NextResponse } from 'next/server';
import { requireActor, isActor, canManage, forbid } from '@/lib/teaching/access';
import { applySurveyToRoster } from '@/lib/teaching/survey-apply';
import type { ParsedSurvey } from '@/lib/teaching/survey-parse';
import { STORES, type StoreId } from '@/lib/types';

export const runtime = 'nodejs';

// 설문 응답 조회·수동 반영 — 운영 권한.
//  GET                      지점별 응답 목록(교육 탭 '설문 결과')
//  POST { responseId }      이 응답을 명부에 (다시) 반영 — 웹훅 자동 반영이 실패했거나 사람이 고쳤을 때
export async function GET() {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const { data, error } = await a.svc
    .from('teaching_survey_responses')
    .select('id, store, submission_id, respondent_name, submitted_at, topics, custom, priorities, note, applied_user_id')
    .order('submitted_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const responses = (data ?? []).map((r) => ({
    id: r.id as number,
    store: r.store as StoreId,
    name: r.respondent_name as string,
    submittedAt: r.submitted_at as string,
    topics: (r.topics as string[]) ?? [],
    custom: (r.custom as string[]) ?? [],
    priorities: ((r.priorities as string[]) ?? []).map((p) => (p ? p : null)),
    note: (r.note as string) ?? '',
    appliedUserId: (r.applied_user_id as string | null) ?? null,
  }));
  return NextResponse.json({ responses, stores: STORES.map((s) => s.id) });
}

export async function POST(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.responseId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'responseId 가 필요합니다.' }, { status: 400 });
  const { data: r } = await a.svc
    .from('teaching_survey_responses')
    .select('id, store, form_id, submission_id, respondent_name, submitted_at, topics, custom, priorities, note')
    .eq('id', id)
    .maybeSingle();
  if (!r) return NextResponse.json({ error: '응답을 찾을 수 없습니다.' }, { status: 404 });
  const parsed: ParsedSurvey = {
    store: r.store as StoreId,
    formId: r.form_id as string,
    submissionId: r.submission_id as string,
    name: r.respondent_name as string,
    submittedAt: r.submitted_at as string,
    topics: (r.topics as string[]) ?? [],
    custom: (r.custom as string[]) ?? [],
    priorities: ((r.priorities as string[]) ?? []).map((p) => (p ? p : null)),
    note: (r.note as string) ?? '',
  };
  const result = await applySurveyToRoster(a.svc, parsed, a.email || 'manual');
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 409 });
  await a.svc.from('teaching_survey_responses').update({ applied_user_id: result.userId }).eq('id', id);
  return NextResponse.json({ ok: true, ...result });
}
