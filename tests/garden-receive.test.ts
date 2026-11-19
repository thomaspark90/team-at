import { describe, expect, it } from 'vitest';
import { confirmedEnFor, receiveTodo } from '@/lib/garden/receive';

const rec = (bean: string, beanEn: string | undefined, confirmedAt?: string) => ({
  bean,
  beanEn,
  createdAt: '2026-11-19T00:00:00.000Z',
  beanEnConfirmed: confirmedAt ? { by: 'a@b.c', at: confirmedAt } : undefined,
});

describe('영문명 확정 승계', () => {
  it('확정되지 않은 임시 표기는 이어받지 않는다', () => {
    expect(confirmedEnFor([rec('에티오피아 게뎁', 'Ethiopia Gedeb')], '에티오피아 게뎁')).toBeNull();
  });
  it('같은 원두(공백·대소문자 무시)의 확정명을 이어받는다', () => {
    const rs = [rec('에티오피아 게뎁', 'Ethiopia Gedeb', '2026-11-19T01:00:00.000Z')];
    expect(confirmedEnFor(rs, ' 에티오피아  게뎁 ')).toBe('Ethiopia Gedeb');
    expect(confirmedEnFor(rs, '케냐 AA')).toBeNull();
  });
  it('여러 번 확정했으면 가장 최근 확정명', () => {
    const rs = [
      rec('과테말라 인헤르또', 'Guatemala Injerto', '2026-11-01T00:00:00.000Z'),
      rec('과테말라 인헤르또', 'Guatemala El Injerto', '2026-11-10T00:00:00.000Z'),
    ];
    expect(confirmedEnFor(rs, '과테말라 인헤르또')).toBe('Guatemala El Injerto');
  });
});

describe('수령 남은 일', () => {
  it('로스팅 날짜와 영문명 확정이 모두 있어야 완료', () => {
    expect(receiveTodo({})).toEqual({ roastDate: true, beanEn: true, done: false });
    expect(receiveTodo({ roastDate: '2026-11-18' }).done).toBe(false);
    expect(receiveTodo({ roastDate: '2026-11-18', beanEnConfirmed: { by: 'a', at: 'x' } }).done).toBe(true);
  });
});
