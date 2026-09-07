import { describe, it, expect, beforeAll } from 'vitest';
import { NAME_RE, PIN_RE, isSimpleEmail, newInternalEmail, newPin, normalizeName, pinToPassword } from '@/lib/account/simple-login';
import { addDays, fmtMd, isYmd, kstToday } from '@/lib/teaching/kst';
import { isFulfilled } from '@/lib/teaching/queries';
import { TEACHING_TOPIC_KEYS } from '@/lib/teaching/topics';

// 간편 로그인·교육 기능의 순수 판정 고정 — 로그인 관문과 '받음' 판정이 조용히 바뀌면 안 된다.

describe('간편 로그인 — 입력 규칙', () => {
  beforeAll(() => {
    process.env.SIMPLE_LOGIN_PEPPER = 'test-pepper';
  });

  it('비밀번호는 숫자 6자리만', () => {
    expect(PIN_RE.test('123456')).toBe(true);
    expect(PIN_RE.test('1234')).toBe(false);
    expect(PIN_RE.test('12345a')).toBe(false);
    expect(newPin()).toMatch(PIN_RE);
  });

  it('이름은 한글·영문·숫자·괄호 1~12자, 공백은 하나로 접는다', () => {
    expect(NAME_RE.test('박연재')).toBe(true);
    expect(NAME_RE.test('박연재(판교)')).toBe(true);
    expect(NAME_RE.test('')).toBe(false);
    expect(NAME_RE.test('이름이너무길어서열두자를넘어요')).toBe(false);
    expect(normalizeName('  박  연재 ')).toBe('박 연재');
  });

  it('내부 이메일은 팀 도메인이라 미들웨어 허용을 통과하고, 판별도 된다', () => {
    const email = newInternalEmail();
    expect(email.endsWith('@team-at.space')).toBe(true);
    expect(isSimpleEmail(email)).toBe(true);
    expect(isSimpleEmail('someone@team-at.space')).toBe(false);
    expect(isSimpleEmail('acct-abc@gmail.com')).toBe(false);
  });

  it('저장 비밀번호는 pepper·이메일·PIN 에 모두 묶인다 (PIN 만으로 Supabase 직접 로그인 불가)', () => {
    const a = pinToPassword('acct-1@team-at.space', '123456');
    expect(a).toHaveLength(64);
    expect(a).not.toBe('123456');
    expect(pinToPassword('acct-1@team-at.space', '123457')).not.toBe(a);
    expect(pinToPassword('acct-2@team-at.space', '123456')).not.toBe(a);
    expect(pinToPassword('ACCT-1@team-at.space', '123456')).toBe(a); // 이메일 대소문자 무시
  });
});

describe('교육 — 날짜·받음 판정', () => {
  it('KST 날짜 유틸', () => {
    expect(kstToday(new Date('2026-09-07T20:00:00Z'))).toBe('2026-09-08'); // UTC 20시 = KST 새벽 5시
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(fmtMd('2026-09-10')).toBe('9/10(목)');
    expect(isYmd('2026-09-10')).toBe(true);
    expect(isYmd('2026/09/10')).toBe(false);
  });

  it('요청 시각 이후 기록이 있어야 받음 — 재요청(requested_at 갱신)하면 다시 열린다', () => {
    const r = { sessionId: 1, date: '2026-09-10', store: 'pangyo' as const, managerName: '김매', createdAt: '2026-09-10T05:00:00Z' };
    expect(isFulfilled('2026-09-01T00:00:00Z', r)).toBe(true);
    expect(isFulfilled('2026-09-11T00:00:00Z', r)).toBe(false);
    expect(isFulfilled('2026-09-01T00:00:00Z', undefined)).toBe(false);
  });

  it('주제 키는 중복 없이 고유하다 (저장 키로 쓰인다)', () => {
    expect(new Set(TEACHING_TOPIC_KEYS).size).toBe(TEACHING_TOPIC_KEYS.length);
  });
});
