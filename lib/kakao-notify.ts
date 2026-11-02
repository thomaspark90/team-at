import { get, put } from '@vercel/blob';
import { blobCollection } from '@/lib/blob-records';
import type { PurchaseRecord } from '@/lib/types';
import { isOwner } from '@/lib/finance/access';

// 원두 발주 → 카카오톡 단톡방 알림 큐.
// 카카오는 채팅방으로 보내는 공식 API가 없어, 서버는 전송 '잡'만 Blob 큐에 쌓고
// 맥의 로컬 전송기(launchd, ~/Projects/kakao-order-notifier)가 큐를 폴링해
// macOS 카카오톡 앱을 조작해 실제 전송한다. 대상 방 이름은 로컬 .env 가 가진다.

export type KakaoNotifyJob = {
  id: string;
  createdAt: string; // ISO
  purchaseId: string; // 발주 기록(PurchaseRecord) id
  room: string; // 대상 카톡방 표시 이름 — 로스터리별 매핑에서 확정 (구 잡엔 없을 수 있음)
  message: string; // 전송기가 그대로 붙여넣는 완성 문구 — 서버에서 확정한다
  status: 'pending' | 'sent' | 'failed';
  requestedBy: string; // [발주] 버튼을 누른 계정 이메일
  sentAt?: string;
  error?: string;
};

// 로스터리 → 발주 카톡방 표시 이름 매핑 — 가든 설정(발주 드롭다운 관리)에서 입력.
// 방 이름은 맥 카톡앱 채팅 검색의 표시 이름과 '정확히' 일치해야 전송된다.
export type KakaoRooms = Record<string, string>;
const ROOMS_PATH = 'data/kakao-rooms.json';

export async function readKakaoRooms(): Promise<KakaoRooms> {
  const res = await get(ROOMS_PATH, { access: 'private', useCache: false });
  if (!res) return {};
  try {
    return JSON.parse(await new Response(res.stream).text()) as KakaoRooms;
  } catch {
    return {};
  }
}

export async function writeKakaoRooms(rooms: KakaoRooms): Promise<void> {
  await put(ROOMS_PATH, JSON.stringify(rooms), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export const kakaoNotifyJobs = blobCollection<KakaoNotifyJob>({
  name: 'kakao-notify',
  legacyPath: 'data/kakao-notify.json', // 신설 컬렉션 — 구 단일 JSON 은 처음부터 없다
  legacyKey: 'jobs',
});

// [발주] 버튼 허용 계정 — KAKAO_ORDER_ALLOWED(쉼표 구분 이메일) + 대표는 항상 허용.
export const canSendKakaoOrder = (email?: string | null): boolean => {
  if (isOwner(email)) return true;
  if (!email) return false;
  const allowed = (process.env.KAKAO_ORDER_ALLOWED ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
};

// 단톡방에 올라갈 발주 메시지 — 매입가·재료비 등 내부 원가 정보는 넣지 않는다.
// 매장에서 직접 보내던 대화체 그대로(2026-11-03): 받을 지점을 넣어 로스터리가 배송지를 되묻지 않게 한다.
const STORE_NAME = { pangyo: '판교점', yangjae: '양재천점' } as const;
const amountOf = (g?: number) => (!g ? '' : g % 1000 === 0 ? `${g / 1000}kg` : `${g}g`);
export function buildOrderMessage(r: PurchaseRecord): string {
  const to = r.store ? `${STORE_NAME[r.store]}으로 ` : '';
  const amount = amountOf(r.settings?.capacityG);
  return `대표님 안녕하세요.\n${to}${r.bean}${amount ? ` ${amount}` : ''} 발주 부탁드립니다.`;
}
