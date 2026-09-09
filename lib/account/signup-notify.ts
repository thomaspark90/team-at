// 간편 계정 자가 가입 알림 — 두 방향.
//  · 신청 접수 → 담당자(고정 수신자)에게 이메일+웹푸시, 승인 화면(/settings) 링크 포함
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

const wrap = (inner: string) => `<div style="font-family:sans-serif;font-size:14px;line-height:1.7">${inner}</div>`;

export async function notifySignupRequest(supabase: SupabaseClient, name: string, contactEmail?: string | null) {
  const settingsUrl = `${APP_URL}/settings`;
  await notifyGardenEvent(supabase, {
    emails: SIGNUP_NOTIFY_EMAILS,
    subject: `[가입 신청] ${name} — 역할·지점 지정 필요`,
    html: wrap(`
        <p><strong>${name}</strong>님이 간편 계정 가입을 신청했어요.</p>
        ${contactEmail ? `<p>연락 이메일: ${contactEmail}</p>` : '<p>연락 이메일: 미기재</p>'}
        <p>설정에서 역할·지점을 지정하면 로그인이 열립니다.</p>
        <p><a href="${settingsUrl}">설정에서 승인하기 →</a></p>`),
    push: { title: `가입 신청 · ${name}`, body: '설정에서 역할·지점을 지정해 주세요', url: '/settings' },
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
