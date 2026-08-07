// 앱 배포 주소 — 알림 메일·푸시의 링크가 모두 이 값을 쓴다.
// 도메인이 바뀌면 NEXT_PUBLIC_APP_URL 환경변수만 바꾸면 된다 (미설정 시 현행 Vercel 주소).
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://team-at-apps.vercel.app';
