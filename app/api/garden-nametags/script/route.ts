import { NextResponse } from 'next/server';
import { buildNametagJsx } from '@/lib/garden/nametag-jsx';
import { expandLines } from '@/lib/garden/nametags';
import { badRequest, nametagRequests, requireNametagActor } from '@/lib/garden/nametags-server';

export const runtime = 'nodejs';

// 인쇄용 일러스트 스크립트 내려받기 — ?ids=a,b,c (관리 탭). 여러 요청을 넘기면 오래된 순으로 한 문서에 이어 붙인다.
export async function GET(req: Request) {
  const a = await requireNametagActor(true);
  if (a instanceof NextResponse) return a;
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
  if (ids.length === 0) return badRequest('요청을 골라주세요.');
  const found = (await Promise.all(ids.map((id) => nametagRequests.readOne(id)))).filter((r) => r != null);
  if (found.length === 0) return badRequest('요청을 찾지 못했습니다.');
  found.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const tags = found.flatMap((r) => expandLines(r.lines));

  // 파일명은 한국 시각 기준 — 그래픽 담당이 내려받은 순서를 알아보게
  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
  const filename = `nametag-${kst.slice(0, 10).replace(/-/g, '')}-${kst.slice(11, 16).replace(':', '')}-${tags.length}tags.jsx`;
  return new NextResponse(buildNametagJsx(tags), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
