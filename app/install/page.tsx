import type { Metadata } from 'next';
import Link from 'next/link';

// 앱 설치 안내 — 신규 스탭 온보딩용 공개 페이지(로그인 불필요).
// team-at은 PWA라 스토어 없이 브라우저에서 홈 화면에 설치한다.

export const metadata: Metadata = { title: '앱 설치 방법' };

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
    <span
      className="tabular text-[11px] text-muted-foreground"
      style={{ flexShrink: 0, width: 18, textAlign: 'right' }}
    >
      {n}.
    </span>
    <span className="text-[13px] text-foreground">{children}</span>
  </li>
);

const Card = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <div className="ta-card bg-background" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div>
      <h2 className="text-[15px] font-medium text-foreground" style={{ margin: 0 }}>
        {title}
      </h2>
      {sub && (
        <p className="text-[13px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          {sub}
        </p>
      )}
    </div>
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {children}
    </ol>
  </div>
);

export default function InstallPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[560px] px-6 py-10" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-team-at.png" alt="TEAM at" className="mb-6 h-6 w-auto dark:invert" />
          <h1 className="text-[22px] font-medium text-foreground" style={{ margin: 0 }}>
            앱 설치 방법
          </h1>
          <p className="text-[13px] text-muted-foreground" style={{ margin: '6px 0 0', lineHeight: 1.7 }}>
            team-at은 앱스토어 없이 브라우저에서 바로 설치하는 웹앱입니다. 설치하면 홈 화면 아이콘으로
            일반 앱처럼 열리고, 알림도 받을 수 있어요. 먼저{' '}
            <span className="text-foreground">team-at-apps.vercel.app</span> 에 접속한 뒤 기기에 맞는
            방법을 따라 주세요.
          </p>
        </div>

        <Card title="iPhone · iPad" sub="Safari에서 (크롬 앱에서는 설치 메뉴가 없어요)">
          <Step n={1}>Safari로 team-at-apps.vercel.app 접속</Step>
          <Step n={2}>
            하단 가운데 <strong>공유 버튼</strong>(네모에 화살표 ↑) 탭
          </Step>
          <Step n={3}>
            메뉴에서 <strong>홈 화면에 추가</strong> 선택
          </Step>
          <Step n={4}>
            이름 확인 후 <strong>추가</strong> — 홈 화면에 team-at 아이콘 생성
          </Step>
        </Card>

        <Card title="Android" sub="Chrome 기준">
          <Step n={1}>Chrome으로 team-at-apps.vercel.app 접속</Step>
          <Step n={2}>
            우측 상단 <strong>⋮ 메뉴</strong> 탭
          </Step>
          <Step n={3}>
            <strong>앱 설치</strong> (또는 홈 화면에 추가) 선택
          </Step>
          <Step n={4}>
            <strong>설치</strong> 확인 — 홈 화면·앱 서랍에 아이콘 생성
          </Step>
        </Card>

        <Card title="PC (Mac · Windows)" sub="Chrome / Edge 기준">
          <Step n={1}>브라우저로 team-at-apps.vercel.app 접속</Step>
          <Step n={2}>
            주소창 오른쪽 끝의 <strong>설치 아이콘</strong>(모니터에 ↓) 클릭 — 없으면 ⋮ 메뉴 →{' '}
            <strong>Cast, 저장 및 공유 → 페이지를 앱으로 설치</strong>
          </Step>
          <Step n={3}>
            <strong>설치</strong> 클릭 — 독/작업표시줄에 고정 가능한 창 앱으로 열림
          </Step>
        </Card>

        <Card title="설치 후 처음 할 일">
          <Step n={1}>
            설치한 앱을 열고 <strong>팀 구글 계정(@team-at.space)</strong>으로 로그인 — 개인 지메일로는
            입장이 안 돼요
          </Step>
          <Step n={2}>
            알림 권한을 묻는 창이 뜨면 <strong>허용</strong> — 발주·측정 요청 알림을 받으려면 필요해요
          </Step>
        </Card>

        <p className="text-[13px] text-muted-foreground" style={{ margin: 0, lineHeight: 1.7 }}>
          설치가 안 되거나 로그인이 막히면 관리자에게 문의해 주세요.{' '}
          <Link href="/" className="underline hover:text-foreground">
            로그인 화면으로 →
          </Link>
        </p>
      </div>
    </div>
  );
}
