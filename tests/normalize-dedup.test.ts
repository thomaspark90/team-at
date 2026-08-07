import { describe, it, expect } from 'vitest';
import { normalizeKey } from '@/lib/finance/normalize';
import { hash } from '@/lib/finance/dedup';

// 자동분류 학습 키와 재업로드 중복 지문 — 둘 다 바뀌면 기존 데이터와 어긋난다.
// normalizeKey 가 달라지면 학습 규칙이 다음 달부터 매칭에 실패하고,
// hash 가 달라지면 재업로드 시 전 거래가 중복 적재된다. 동작을 여기 고정한다.

describe('normalizeKey', () => {
  it('날짜·번호 꼬리를 제거해 어근만 남긴다 (문서 예시 고정)', () => {
    expect(normalizeKey('토스_2026070')).toBe('토스');
    expect(normalizeKey('현대861456417')).toBe('현대');
    expect(normalizeKey('최은숙 6/28')).toBe('최은숙');
    expect(normalizeKey('신한모준원 5월')).toBe('신한모준원');
    expect(normalizeKey('카카오페이정산')).toBe('카카오페이정산');
  });

  it('같은 거래처의 달만 다른 표기는 같은 키가 된다', () => {
    expect(normalizeKey('최은숙 6/28')).toBe(normalizeKey('최은숙 6/27'));
    expect(normalizeKey('토스_2026070')).toBe(normalizeKey('토스_2026062'));
  });

  it('영문 대소문자·구분자 무시 (법인격 "주"는 단어로 남는다 — 현행 동작)', () => {
    expect(normalizeKey('Coupang_')).toBe('coupang');
    expect(normalizeKey('Coupang(주)')).toBe('coupang 주');
  });
});

describe('dedup hash', () => {
  it('같은 입력 = 같은 지문, 32자 hex', () => {
    const a = hash('naverpay', '2026-08-01 12:00:00', '가게', '상품', 12000);
    expect(a).toBe(hash('naverpay', '2026-08-01 12:00:00', '가게', '상품', 12000));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it('출처·금액이 다르면 다른 지문 (파이프라인 간 충돌 방지)', () => {
    expect(hash('naverpay', 'X1')).not.toBe(hash('coupang', 'X1'));
    expect(hash('coupang', '2026-08-01', '가게', '상품', 12000)).not.toBe(
      hash('coupang', '2026-08-01', '가게', '상품', 12001)
    );
  });

  it('필드 경계가 구분된다 — 이어붙임 모호성 없음', () => {
    expect(hash('a', 'bc')).not.toBe(hash('ab', 'c'));
  });
});
