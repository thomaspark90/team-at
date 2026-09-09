import PageShell from '@/components/PageShell';
import PinChangeForm from '@/components/account/PinChangeForm';

// 간편 계정 비밀번호(6자리) 변경 — 첫 로그인·초기화 직후엔 여기로 먼저 보낸다.
export const metadata = { title: '비밀번호 변경' };

export default function PinPage() {
  return (
    <PageShell width="narrow">
      <PinChangeForm />
    </PageShell>
  );
}
