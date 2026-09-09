import type { SupabaseClient } from '@supabase/supabase-js';
import { newInternalEmail, newPin, pinToPassword } from '@/lib/account/simple-login';
import { loadRoles, manageRoleKeys } from '@/lib/account/roles';
import type { ParsedSurvey } from '@/lib/teaching/survey-parse';

// 설문 응답 → 지점 명부 반영. 웹훅(ingest)과 화면의 '명부에 반영' 버튼이 같은 함수를 쓴다.
//  · 같은 이름의 활성 스탭 프로필이 있으면 그 사람, 없으면 로그인 없는 명부 계정(roster_only)을 새로 만든다.
//  · 위시 = 응답 topics 전체 집합(기존 요청은 requested_at 유지), 순위 = 1·2·3순위, 메모 = 자유 서술 + 직접 추가 주제.
//  · 매니저급(운영 권한 역할) 이름과 겹치면 반영하지 않는다(설문은 스탭용).

export type ApplyResult = { userId: string; created: boolean } | { error: string };

export async function applySurveyToRoster(svc: SupabaseClient, r: ParsedSurvey, createdBy: string): Promise<ApplyResult> {
  const roles = await loadRoles(svc);
  const manageKeys = manageRoleKeys(roles);
  const { data: existing } = await svc
    .from('profiles')
    .select('user_id, role, status, stores')
    .eq('display_name', r.name)
    .maybeSingle();

  let userId: string;
  let created = false;
  if (existing) {
    if (existing.status !== 'active') return { error: `'${r.name}' 은 승인 대기 계정 — 승인 후 다시 반영하세요.` };
    if (manageKeys.has(existing.role as string)) return { error: `'${r.name}' 은 운영 권한 계정이라 반영하지 않았어요.` };
    userId = existing.user_id as string;
    const stores = new Set([...(existing.stores as string[]), r.store]);
    if (stores.size !== (existing.stores as string[]).length) {
      await svc.from('profiles').update({ stores: Array.from(stores), updated_at: new Date().toISOString() }).eq('user_id', userId);
    }
  } else {
    const email = newInternalEmail();
    const password = pinToPassword(email, newPin()) + newPin(); // 아무도 모르는 값 — 로그인은 설정에서 '로그인 열기'
    const { data: createdUser, error: createErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: r.name, roster_only: true, source: 'survey' },
    });
    if (createErr || !createdUser.user) return { error: createErr?.message ?? '계정 생성 실패' };
    userId = createdUser.user.id;
    const { error: profErr } = await svc.from('profiles').insert({
      user_id: userId,
      display_name: r.name,
      role: 'staff',
      stores: [r.store],
      simple_login: false,
      roster_only: true,
      pin_reset_required: false,
      status: 'active',
      created_by: createdBy,
    });
    if (profErr) {
      await svc.auth.admin.deleteUser(userId);
      return { error: profErr.message };
    }
    await svc
      .from('garden_tab_access')
      .upsert({ user_id: userId, email, sections: ['garden'], tabs: ['teaching'], updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    created = true;
  }

  // 위시 — 응답 주제 전체 집합. 기존에 있던 건 requested_at 유지(받음 판정 보존), 새 건 지금.
  const now = new Date().toISOString();
  const { data: have } = await svc.from('teaching_wishes').select('topic_key').eq('user_id', userId);
  const haveKeys = new Set((have ?? []).map((w) => w.topic_key as string));
  const want = new Set(r.topics);
  const toDelete = Array.from(haveKeys).filter((k) => !want.has(k));
  const toInsert = r.topics.filter((k) => !haveKeys.has(k));
  if (toDelete.length) await svc.from('teaching_wishes').delete().eq('user_id', userId).in('topic_key', toDelete);
  if (toInsert.length) await svc.from('teaching_wishes').insert(toInsert.map((k) => ({ user_id: userId, topic_key: k, requested_at: now })));

  // 순위 — 전부 비운 뒤 1·2·3 지정('custom' 은 메모로만)
  await svc.from('teaching_wishes').update({ priority: null }).eq('user_id', userId);
  for (let i = 0; i < 3; i++) {
    const key = r.priorities[i];
    if (key && key !== 'custom' && want.has(key)) {
      await svc.from('teaching_wishes').update({ priority: i + 1 }).eq('user_id', userId).eq('topic_key', key);
    }
  }

  // 메모 — 설문 날짜 + 직접 추가 주제 + 자유 서술 (순위에 '직접 추가'가 있으면 그것도 표기)
  const day = r.submittedAt.slice(0, 10).replace(/^\d{4}-(\d{2})-(\d{2})$/, (_m, mm, dd) => `${Number(mm)}/${Number(dd)}`);
  const customRank = r.priorities.indexOf('custom');
  const parts: string[] = [`설문 ${day}`];
  if (r.custom.length) parts.push(`${customRank >= 0 ? `${customRank + 1}순위 ` : ''}직접 추가 주제: ${r.custom.join(' / ')}`);
  if (r.note) parts.push(`자유 서술: ${r.note}`);
  await svc.from('teaching_notes').upsert({ user_id: userId, note: parts.join(' · ').slice(0, 500), updated_at: now }, { onConflict: 'user_id' });

  return { userId, created };
}
