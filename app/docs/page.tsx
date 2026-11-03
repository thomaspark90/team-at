import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { isOwner } from '@/lib/finance/access';
import { INTERNAL_DOCS } from '@/lib/docs/registry';
import { docShareToken } from '@/lib/docs/share-token';
import PageShell from '@/components/PageShell';
import CopyLinkButton from '@/components/docs/CopyLinkButton';

// 내부 문서 — 대표 전용 목록. 여기서만 공유 링크(토큰)를 볼 수 있다.
// 다른 팀 계정은 미들웨어(로그인·허용 계정) 통과 후 이 페이지에서 다시 막힌다.
// 문서 본문은 /d/[토큰] 에서만 열린다 — 로그인 여부와 무관하게 토큰이 맞아야 한다.
export const dynamic = 'force-dynamic';

export default async function DocsPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');
  if (!isOwner(user.email)) redirect('/');

  const rows = INTERNAL_DOCS.map(({ doc, version }) => {
    const token = docShareToken(doc.slug, version);
    return { doc, path: token ? `/d/${token}` : null };
  });

  return (
    <PageShell title="문서" subtitle="링크를 가진 사람만 열람할 수 있는 내부 공유 문서입니다. 링크가 새면 문서 버전을 올려 회수합니다.">
      <div className="space-y-4">
        {rows.map(({ doc, path }) => (
          <div key={doc.slug} className="ta-panel flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="m-0 text-title">{doc.title}</p>
              <p className="m-0 mt-1 text-caption text-muted-foreground">갱신 {doc.updated}</p>
            </div>
            {path ? (
              <div className="flex items-center gap-3">
                <CopyLinkButton path={path} />
                <Link href={path} className="text-body text-muted-foreground hover:text-foreground">
                  열기 ›
                </Link>
              </div>
            ) : (
              <p className="m-0 text-body text-destructive">DOCS_SHARE_SECRET 미설정 — 링크 발급 불가</p>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
