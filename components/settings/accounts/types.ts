import type { StoreId } from '@/lib/types';

// 설정 > 계정 — 간편 계정(프로필)과 로그인 계정(auth + 접근 권한)을 한 줄로 합친 모델 (2026-11-03 통합)

// /api/simple-accounts 의 프로필 행
export type ProfileRow = {
  user_id: string;
  display_name: string;
  role: string;
  stores: StoreId[];
  simple_login: boolean;
  roster_only?: boolean;
  can_view_comments?: boolean;
  pin_reset_required: boolean;
  locked_until: string | null;
  status: 'pending' | 'active' | 'left';
  created_at: string;
  contact_email: string | null;
};

// /api/garden-tab-access 의 계정 행 (대표 제외)
export type UserRow = {
  id: string;
  email: string;
  lastSignInAt?: string | null;
  name?: string | null;
  simpleLogin?: boolean;
  tabs: string[] | null;
  sections: string[] | null;
  studioTabs: string[] | null;
};

export type AccessKind = 'tabs' | 'sections' | 'studioTabs';

export type Account = {
  id: string; // auth user id (= profile user_id)
  kind: 'simple' | 'email'; // 간편 = 이름+6자리(명부만 있는 계정 포함), 이메일 = 구글·이메일 로그인
  title: string; // 간편은 이름, 이메일은 주소
  user: UserRow | null; // 로그인 계정이 없으면 null(명부만 남은 프로필)
  profile: ProfileRow | null;
};

export function mergeAccounts(users: UserRow[], profiles: ProfileRow[]): Account[] {
  const profileOf = new Map(profiles.map((p) => [p.user_id, p]));
  const seen = new Set<string>();
  const out: Account[] = [];
  for (const u of users) {
    seen.add(u.id);
    const profile = profileOf.get(u.id) ?? null;
    if (profile?.status === 'pending') continue; // 가입 신청 대기는 목록 위 승인 칸에서만
    const simple = !!profile && (profile.simple_login || !!profile.roster_only);
    out.push({ id: u.id, kind: simple ? 'simple' : 'email', title: simple ? profile!.display_name : u.email, user: u, profile });
  }
  // 로그인 계정 목록(대표 제외)에 없는 프로필 — 대표 본인 프로필은 빼고 간편으로 보여준다
  for (const p of profiles) {
    if (seen.has(p.user_id) || p.status === 'pending' || !(p.simple_login || p.roster_only)) continue;
    out.push({ id: p.user_id, kind: 'simple', title: p.display_name, user: null, profile: p });
  }
  // 간편 먼저(이름순), 이메일 뒤(주소순)
  return out.sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title, 'ko') : a.kind === 'simple' ? -1 : 1));
}
