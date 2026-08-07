import type { Metadata } from 'next';
import { findShare } from '@/lib/garden-share';

// 공개 공유 카드 — 로그인 없이 접근(미들웨어 보호 경로 밖). 판매가만 노출.
export const dynamic = 'force-dynamic';

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const share = await findShare(params.token);
  if (!share) return { title: 'Garden Service', robots: { index: false } };
  const title = `${share.bean} — 판매가 ${won(share.price)}`;
  const description = `Garden Service 원두 판매가 안내 · ${fmtDate(share.decidedAt)}`;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const share = await findShare(params.token);

  return (
    <main
      className="bg-background text-foreground"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {share ? (
        <div className="ta-card bg-background" style={{ width: '100%', maxWidth: 360, textAlign: 'center', padding: '36px 24px' }}>
          <p className="ta-label" style={{ marginBottom: 4 }}>Garden Service · 판매가 안내</p>
          <p className="text-[20px] text-foreground" style={{ margin: '12px 0 4px', fontWeight: 600 }}>
            {share.bean}
          </p>
          <p className="tabular text-foreground" style={{ fontSize: 34, fontWeight: 700, margin: '8px 0' }}>
            {won(share.price)}
          </p>
          <p className="text-[12px] text-muted-foreground" style={{ marginTop: 12 }}>
            {fmtDate(share.decidedAt)} 책정 · team at
          </p>
        </div>
      ) : (
        <div className="ta-card bg-background" style={{ width: '100%', maxWidth: 360, textAlign: 'center', padding: '36px 24px' }}>
          <p className="text-[14px] text-foreground" style={{ marginBottom: 6 }}>링크를 찾을 수 없어요</p>
          <p className="text-[12px] text-muted-foreground">주소가 잘못되었거나 만료된 링크일 수 있습니다.</p>
        </div>
      )}
    </main>
  );
}
