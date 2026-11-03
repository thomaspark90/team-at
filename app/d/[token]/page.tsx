import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { INTERNAL_DOCS } from '@/lib/docs/registry';
import { tokenMatches } from '@/lib/docs/share-token';
import DocArticle from '@/components/docs/DocArticle';

// 내부 문서 공유 화면 — 미들웨어 보호 경로 밖(로그인 불필요). 토큰이 맞아야만 본문을 그린다.
// 토큰이 틀리면 404 — 어떤 문서가 있는지(제목 포함)도 드러내지 않는다.
// 검색 노출 금지 + 리퍼러로 토큰 URL 이 새지 않게 no-referrer.
export const dynamic = 'force-dynamic';

const findDoc = (token: string) =>
  INTERNAL_DOCS.find(({ doc, version }) => tokenMatches(token, doc.slug, version))?.doc;

export function generateMetadata({ params }: { params: { token: string } }): Metadata {
  const doc = findDoc(params.token);
  return {
    title: doc ? doc.title : 'team at',
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

export default function SharedDocPage({ params }: { params: { token: string } }) {
  const doc = findDoc(params.token);
  if (!doc) notFound();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[980px] px-6 py-10 sm:py-14">
        <header className="mb-10">
          <p className="ta-label">team at · 내부 공유 문서 · 갱신 {doc.updated}</p>
          <h1 className="m-0 text-display">{doc.title}</h1>
          <p className="ta-prose mt-3 text-body leading-relaxed text-muted-foreground">{doc.subtitle}</p>
        </header>
        <DocArticle doc={doc} />
        <p className="mt-10 text-caption text-muted-foreground">이 링크는 외부로 전달하지 마세요.</p>
      </div>
    </main>
  );
}
