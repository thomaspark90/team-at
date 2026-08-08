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
  message: string; // 전송기가 그대로 붙여넣는 완성 문구 — 서버에서 확정한다
  status: 'pending' | 'sent' | 'failed';
  requestedBy: string; // [발주] 버튼을 누른 계정 이메일
  sentAt?: string;
  error?: string;
};

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

const kstDate = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${day})`;
};

// 단톡방에 올라갈 발주 메시지 — 매입가·재료비 등 내부 원가 정보는 넣지 않는다.
export function buildOrderMessage(r: PurchaseRecord): string {
  const lines = [
    '📦 원두 발주',
    `· 원두: ${r.roastery ? `${r.roastery} · ` : ''}${r.bean}`,
    `· 용량: ${r.settings?.capacityG ?? '?'}g`,
  ];
  if (r.roastDate) lines.push(`· 로스팅: ${r.roastDate}`);
  if (r.staffName) lines.push(`· 발주자: ${r.staffName}님`);
  lines.push(`· 등록일: ${kstDate(r.createdAt)}`);
  return lines.join('\n');
}
