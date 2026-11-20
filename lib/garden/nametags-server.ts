// 서버 전용 — 네임택 카탈로그(Blob 단일 JSON)와 프린트 요청(기록별 Blob). 클라이언트에서 import 금지.
import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { requireGardenTab } from '@/lib/access/guard';
import { blobCollection } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { topicEmails } from '@/lib/garden-notify-topics-server';
import { NAMETAG_SEED } from './nametag-seed';
import type { NametagCatalog, NametagContact, NametagRequest } from './nametags';

const CATALOG_PATH = 'data/garden-nametags/catalog.json';

/** 카탈로그 — 저장된 적이 없으면 초기 메뉴(seed). 메뉴 수정은 한두 사람이 가끔 하는 일이라 단일 JSON 으로 둔다. */
export async function readCatalog(): Promise<NametagCatalog> {
  const res = await get(CATALOG_PATH, { access: 'private', useCache: false });
  if (!res) return NAMETAG_SEED;
  try {
    const parsed = JSON.parse(await new Response(res.stream).text()) as NametagCatalog;
    return Array.isArray(parsed.items) && Array.isArray(parsed.categories) ? parsed : NAMETAG_SEED;
  } catch {
    return NAMETAG_SEED;
  }
}

export async function writeCatalog(catalog: NametagCatalog): Promise<NametagCatalog> {
  const next = { ...catalog, updatedAt: new Date().toISOString() };
  await put(CATALOG_PATH, JSON.stringify(next), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return next;
}

// 담당자 이름·연락처 — 이메일(소문자) → { name, phone }. 가든 설정에서 입력한다.
const CONTACTS_PATH = 'data/garden-nametags/contacts.json';
type ContactMap = Record<string, { name: string; phone: string }>;

export async function readContacts(): Promise<ContactMap> {
  const res = await get(CONTACTS_PATH, { access: 'private', useCache: false });
  if (!res) return {};
  try {
    return JSON.parse(await new Response(res.stream).text()) as ContactMap;
  } catch {
    return {};
  }
}

export async function writeContacts(map: ContactMap) {
  await put(CONTACTS_PATH, JSON.stringify(map), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export const toContact = (map: ContactMap, email: string): NametagContact => {
  const c = map[email.toLowerCase()];
  return { email, name: c?.name ?? '', phone: c?.phone ?? '' };
};

/** 지금 프린트 요청 알림을 받는 사람들 — 담당자 미지정이면 원두 알림 수신자(topicEmails 폴백). */
export async function printRecipients(supabase: Supabase): Promise<NametagContact[]> {
  const [emails, contacts] = await Promise.all([topicEmails(supabase, 'nametagPrint'), readContacts()]);
  return emails.map((e) => toContact(contacts, e));
}

// 요청은 여러 사람이 동시에 보낼 수 있어 기록 1건 = blob 1개(동시 저장 유실 없음)
export const nametagRequests = blobCollection<NametagRequest>({
  name: 'garden-nametag-requests',
  legacyPath: 'data/garden-nametag-requests.json', // 신설 컬렉션 — 구 단일 JSON 은 처음부터 없다
  legacyKey: 'requests',
});

export const REQUEST_TAB = 'nametags';
export const MANAGE_TAB = 'nametags_manage';

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type NametagActor = { supabase: Supabase; user: User; canManage: boolean };

/** 로그인 + 탭 권한 확인. manage=true 면 관리 권한(인쇄 파일·메뉴 수정)까지 요구한다. */
export async function requireNametagActor(manage = false): Promise<NametagActor | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const manageDenied = await requireGardenTab(supabase, user, MANAGE_TAB);
  if (manage) return manageDenied ?? { supabase, user, canManage: true };
  if (!manageDenied) return { supabase, user, canManage: true };
  const denied = await requireGardenTab(supabase, user, REQUEST_TAB);
  return denied ?? { supabase, user, canManage: false };
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
