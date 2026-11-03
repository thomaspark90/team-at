import { describe, it, expect } from 'vitest';
import { roastInfo, restStage } from '@/lib/garden/roast';

describe('로스팅일 기준 경과일', () => {
  it('실제 로스팅일이 있으면 그 값', () => {
    const r = roastInfo({ roastDate: '2026-10-01', orderDate: '2026-09-30', createdAt: '2026-09-30T01:00:00Z' });
    expect(r?.estimated).toBe(false);
    expect(r?.date).toBe('2026-10-01');
  });
  it('없으면 발주일 +1 추정', () => {
    const r = roastInfo({ orderDate: '2026-10-31', createdAt: '2026-10-31T01:00:00Z' });
    expect(r).toMatchObject({ date: '2026-11-01', estimated: true });
  });
  it('orderDate 없으면 createdAt(KST) +1 — 월말 넘김', () => {
    const r = roastInfo({ createdAt: '2026-10-31T16:00:00Z' }); // KST 11-01 01:00
    expect(r?.date).toBe('2026-11-02');
  });
  it('숙성 단계 경계', () => {
    expect(restStage(6)).toBe('resting');
    expect(restStage(7)).toBe('peak');
    expect(restStage(21)).toBe('peak');
    expect(restStage(22)).toBe('late');
    expect(restStage(31)).toBe('old');
  });
});
