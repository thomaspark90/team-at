import TabNav from '@/components/TabNav';
import PinChangeForm from '@/components/account/PinChangeForm';

// 간편 계정 비밀번호(6자리) 변경 — 첫 로그인·초기화 직후엔 여기로 먼저 보낸다.
export const metadata = { title: '비밀번호 변경' };

export default function PinPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <PinChangeForm />
      </div>
    </div>
  );
}
