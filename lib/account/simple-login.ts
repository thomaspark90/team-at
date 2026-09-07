import { createHash, randomBytes, randomInt } from 'crypto';
import { TEAM_DOMAIN } from '@/lib/finance/access';

// 간편 로그인(이름 + 숫자 6자리) — Supabase 이메일/비밀번호 계정 위에 얹는다.
//  · 내부 이메일: acct-<랜덤>@team-at.space — 팀 도메인이라 미들웨어 허용 판정을 그대로 통과한다.
//    워크스페이스에 없는 주소라 구글 로그인으로는 절대 들어올 수 없다.
//  · 저장 비밀번호: sha256(pepper : 내부이메일 : PIN). PIN 만으로는 Supabase 에 직접 로그인할 수
//    없고(pepper 는 서버만 안다) 로그인은 항상 /api/simple-login 을 거치므로 잠금(5회/10분)이 유효하다.

export const PIN_RE = /^\d{6}$/;
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 10;

export const isSimpleEmail = (email?: string | null) =>
  !!email && /^acct-[a-z0-9]+@/.test(email.toLowerCase()) && email.toLowerCase().endsWith('@' + TEAM_DOMAIN);

export const newInternalEmail = () => `acct-${randomBytes(6).toString('hex')}@${TEAM_DOMAIN}`;

export const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function pinToPassword(email: string, pin: string): string {
  const pepper = process.env.SIMPLE_LOGIN_PEPPER;
  if (!pepper) throw new Error('SIMPLE_LOGIN_PEPPER 환경변수가 없습니다.');
  return createHash('sha256').update(`${pepper}:${email.toLowerCase()}:${pin}`).digest('hex');
}

// 표시 이름: 한글·영문·숫자·공백·괄호, 1~12자 — "박연재(판교)"처럼 동명이인 구분 허용(대표 발급·수정용)
export const NAME_RE = /^[가-힣a-zA-Z0-9 ()]{1,12}$/;
// 자가 가입 이름: 성 포함 한글 3글자 정확히(2026-09-07 대표 결정) — 동명이인은 승인 때 대표가 구분해 고친다
export const SIGNUP_NAME_RE = /^[가-힣]{3}$/;
// 승인 대기 상한 — 공개 가입 엔드포인트 도배 방어
export const MAX_PENDING = 50;
export const normalizeName = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
