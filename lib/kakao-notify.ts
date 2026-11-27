import { get, put } from '@vercel/blob';
import { blobCollection } from '@/lib/blob-records';
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
  manual?: boolean; // 카톡 전송 없이 '직접 발주 완료'로 닫은 건 — 전화·직접 카톡 등 (2026-11-24)
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

// 발주 문구와 '오늘 이미 인사했는지' 판정은 순수 함수로 따로 둔다(테스트 대상).
export { buildOrderMessage, greetedToday } from '@/lib/kakao-order-message';
