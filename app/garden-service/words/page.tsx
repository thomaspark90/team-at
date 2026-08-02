import type { Metadata } from 'next';
import WordsClient from './words-client';

// 손님용 공개 페이지 — /garden/* (팀 전용)과 달리 인증 없이 접근한다.
export const metadata: Metadata = {
  title: { absolute: '제철 단어 — Garden Service' },
  description: '여름의 단어들이 놓여 있습니다. 당신의 단어도 하나 두고 가세요.',
  robots: { index: true, follow: true },
};

export default function Page() {
  return <WordsClient />;
}
