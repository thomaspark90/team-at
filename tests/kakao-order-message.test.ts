import { describe, expect, it } from 'vitest';
import { buildOrderMessage, greetedToday } from '@/lib/kakao-order-message';

const rec = { store: 'pangyo' as const, bean: '에티오피아 곤조베 워시드', settings: { capacityG: 1000 } as never };
const ROOM = '자이언트커피 가든서비스 발주';
// 2026-11-27 15:00 KST
const NOW = '2026-11-27T06:00:00.000Z';

describe('발주 카톡 문구', () => {
  it('그날 첫 발주는 인사말로 시작한다', () => {
    expect(buildOrderMessage(rec)).toBe('대표님 안녕하세요.\n판교점으로 에티오피아 곤조베 워시드 1kg 발주 부탁드립니다.');
  });
  it('같은 날 두 번째부터는 발주 내용만', () => {
    expect(buildOrderMessage(rec, { greet: false })).toBe('판교점으로 에티오피아 곤조베 워시드 1kg 발주 부탁드립니다.');
  });
});

describe('오늘 이미 인사했는지', () => {
  const job = (o: Partial<Parameters<typeof greetedToday>[0][number]>) => ({ room: ROOM, status: 'sent' as const, createdAt: '2026-11-27T05:45:00.000Z', ...o });

  it('오늘 이 방에 보낸 건이 있으면 true', () => {
    expect(greetedToday([job({ sentAt: '2026-11-27T05:46:34.000Z' })], ROOM, NOW)).toBe(true);
  });
  it('대기 중인 건도 센다 — 먼저 올라가므로', () => {
    expect(greetedToday([job({ status: 'pending' })], ROOM, NOW)).toBe(true);
  });
  it('실패한 건 · 직접 발주 완료 · 다른 방 · 어제 건은 세지 않는다', () => {
    expect(greetedToday([job({ status: 'failed' })], ROOM, NOW)).toBe(false);
    expect(greetedToday([job({ manual: true, room: '' })], ROOM, NOW)).toBe(false);
    expect(greetedToday([job({ room: '다른 방' })], ROOM, NOW)).toBe(false);
    // 11-26 23:50 KST 에 보낸 건
    expect(greetedToday([job({ createdAt: '2026-11-26T14:50:00.000Z', sentAt: '2026-11-26T14:50:30.000Z' })], ROOM, NOW)).toBe(false);
  });
  it('날짜는 한국 시간으로 가른다 — 자정 직후(KST)는 새 날', () => {
    // 11-28 00:10 KST = 11-27 15:10 UTC — 11-27 KST 에 보낸 건은 어제
    expect(greetedToday([job({ sentAt: '2026-11-27T05:46:34.000Z' })], ROOM, '2026-11-27T15:10:00.000Z')).toBe(false);
  });
});
