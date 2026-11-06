// 간편 계정 자가 가입 알림 — 두 방향.
//  · 신청 접수 → 대표 + 운영진(schedule_editors)에게 이메일+웹푸시, 승인 화면(직원 명부) 링크 포함
//  · 승인 완료 → 신청자가 가입 때 적은 연락용 이메일로 "로그인하세요" 한 통(이메일 없으면 스킵)
// 어떤 실패도 가입·승인 처리를 막지 않는다(호출부에서 catch 후 무시).
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyGardenEvent } from '@/lib/notify';
import { APP_URL } from '@/lib/app-url';

// 수신자: 사용자 지시(2026-09-09)로 고정. Gmail은 점(.)을 무시하므로 thomas.in.park@ 과 같은 계정.
export const SIGNUP_NOTIFY_EMAILS = ['thomasinpark@gmail.com'];

// 연락용 이메일 형식 — 느슨한 검사(로컬@도메인.최상위). 빈 값은 허용(선택 항목).
export const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeContactEmail = (v: unknown): string => String(v ?? '').trim().toLowerCase().slice(0, 120);

/** 신청 알림 수신자 — 대표 + 운영진. 간편 계정(내부 이메일)은 메일을 받을 수 없어 뺀다. */
async function signupRecipients(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('schedule_editors').select('email');
  const editors = (data ?? []).map((r) => r.email as string).filter((e) => !e.startsWith('acct-'));
  return Array.from(new Set([...SIGNUP_NOTIFY_EMAILS, ...editors]));
}

const wrap = (inner: string) => `<div style="font-family:sans-serif;font-size:14px;line-height:1.7">${inner}</div>`;

export async function notifySignupRequest(supabase: SupabaseClient, name: string, contactEmail?: string | null) {
  const approveUrl = `${APP_URL}/garden/schedule/staff`;
  await notifyGardenEvent(supabase, {
    emails: await signupRecipients(supabase),
    subject: `[가입 신청] ${name} — 지점 지정 필요`,
    html: wrap(`
        <p><strong>${name}</strong>님이 간편 계정 가입을 신청했어요.</p>
        ${contactEmail ? `<p>연락 이메일: ${contactEmail}</p>` : '<p>연락 이메일: 미기재</p>'}
        <p>직원 명부에서 지점을 골라 승인하면 로그인이 열립니다.</p>
        <p><a href="${approveUrl}">직원 명부에서 승인하기 →</a></p>`),
    push: { title: `가입 신청 · ${name}`, body: '직원 명부에서 지점을 골라 승인해 주세요', url: '/garden/schedule/staff' },
  });
}

export async function notifySignupApproved(
  supabase: SupabaseClient,
  n: { name: string; contactEmail: string | null | undefined; roleLabel: string; storeLabels: string[] }
) {
  const to = normalizeContactEmail(n.contactEmail);
  if (!CONTACT_EMAIL_RE.test(to)) return;
  await notifyGardenEvent(supabase, {
    emails: [to],
    subject: `[team at] ${n.name}님, 가입이 승인됐어요`,
    html: wrap(`
        <p><strong>${n.name}</strong>님, 가입이 승인됐어요.</p>
        <p>역할: ${n.roleLabel} · 지점: ${n.storeLabels.join(', ') || '-'}</p>
        <p>로그인 화면에서 가입 때 정한 <b>이름 + 비밀번호 6자리</b>로 로그인하세요.</p>
        <p><a href="${APP_URL}">로그인하러 가기 →</a></p>`),
    push: { title: '가입 승인', body: `${n.name}님, 이제 로그인할 수 있어요`, url: '/' },
  });
}
