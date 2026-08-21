import { describe, it, expect } from 'vitest';
import { toKstWallClock } from '@/lib/finance/txTime';

// tx_at 저장 규약 = KST 벽시계(오프셋 없음). 은행 적재와 수집기 적재가 같은 축을 쓰게 강제한다.
describe('toKstWallClock', () => {
  it('오프셋 없는 KST 문자열은 그대로 둔다(은행 적재와 동일 축)', () => {
    expect(toKstWallClock('2026-08-02 08:03:39')).toBe('2026-08-02T08:03:39');
    expect(toKstWallClock('2026-08-02T08:03:39')).toBe('2026-08-02T08:03:39');
  });

  it('날짜만 오면 자정으로', () => {
    expect(toKstWallClock('2026-08-02')).toBe('2026-08-02T00:00:00');
  });

  it('타임존이 붙어 오면 KST 벽시계로 환산해 오프셋을 뗀다', () => {
    expect(toKstWallClock('2026-08-01T23:03:39Z')).toBe('2026-08-02T08:03:39');
    expect(toKstWallClock('2026-08-02T08:03:39+09:00')).toBe('2026-08-02T08:03:39');
  });

  it('예전 버그 재발 방지 — +09:00을 덧붙여 UTC로 밀어넣지 않는다', () => {
    expect(toKstWallClock('2026-08-02 08:03:39')).not.toMatch(/[+Z]/i);
  });
});
