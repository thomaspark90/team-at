import { describe, expect, it } from 'vitest';
import { confirmedEnFor, matchScanToPending, receiveAssigned, receiveTodo } from '@/lib/garden/receive';

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
  const ok = { by: 'a', at: 'x' };
  it('로스팅 날짜 → 영문명 확정 → 원두카드 요청이 모두 끝나야 완료', () => {
    expect(receiveTodo({})).toEqual({ roastDate: true, beanEn: true, cardRequest: false, done: false });
    expect(receiveTodo({ roastDate: '2026-11-18' }).done).toBe(false);
    const confirmed = { roastDate: '2026-11-18', beanEnConfirmed: ok };
    expect(receiveTodo(confirmed)).toMatchObject({ cardRequest: true, done: false });
    expect(receiveTodo({ ...confirmed, cardRequested: ok }).done).toBe(true);
  });
  it('영문명 확정 전에는 원두카드 요청이 생기지 않는다', () => {
    expect(receiveTodo({ roastDate: '2026-11-18' }).cardRequest).toBe(false);
  });
  it('이미 인쇄 완료한 카드는 다시 요청하라고 하지 않는다', () => {
    expect(receiveTodo({ roastDate: '2026-11-18', beanEnConfirmed: ok, cardDone: ok }).done).toBe(true);
  });
});

describe('봉투 촬영 → 발주 찾기', () => {
  const a = { bean: '에티오피아 게뎁 워시드', beanEn: undefined, roastery: '언스페셜티' };
  const b = { bean: '케냐 니에리 AA', beanEn: 'Kenya Nyeri', roastery: '프릳츠' };
  it('후보가 하나면 그 발주', () => {
    expect(matchScanToPending({ beanName: '전혀 다른 이름' }, [a])).toBe(a);
  });
  it('한글 원두명이 겹치는 발주를 고른다', () => {
    expect(matchScanToPending({ beanName: '에티오피아 게뎁' }, [a, b])).toBe(a);
  });
  it('영문 표기·로스팅사로도 찾는다', () => {
    expect(matchScanToPending({ beanNameEn: 'Kenya Nyeri AA Washed' }, [a, b])).toBe(b);
    expect(matchScanToPending({ roastery: '프릳츠' }, [a, b])).toBe(b);
  });
  it('겹치는 게 없거나 동점이면 고르지 않는다 — 사람이 목록에서 고른다', () => {
    expect(matchScanToPending({ beanName: '콜롬비아 핑크 버번' }, [a, b])).toBeNull();
    expect(matchScanToPending({ beanName: '에티오피아 케냐' }, [a, b])).toBeNull();
    expect(matchScanToPending({ beanName: '에티오피아' }, [])).toBeNull();
  });
});

describe('수령 담당 판정', () => {
  it('담당자가 비어 있으면 null — 발주 탭 권한으로 넘긴다', () => {
    expect(receiveAssigned([], 'a@b.c')).toBeNull();
    expect(receiveAssigned(undefined, 'a@b.c')).toBeNull();
  });
  it('지정돼 있으면 그 사람만(대소문자 무시)', () => {
    expect(receiveAssigned(['Staff@b.c'], 'staff@B.C')).toBe(true);
    expect(receiveAssigned(['staff@b.c'], 'other@b.c')).toBe(false);
    expect(receiveAssigned(['staff@b.c'], null)).toBe(false);
  });
});
