import { NextResponse } from 'next/server';
import { checkAiQuota } from '@/lib/access/rate-limit';
import { logActivity } from '@/lib/finance/activity';
import { draftNametag } from '@/lib/garden/nametag-draft';
import { badRequest, readCatalog, requireNametagActor } from '@/lib/garden/nametags-server';

export const runtime = 'nodejs';

const ACTION = '네임택 문구 AI 초안';

// 한글 메뉴 이름 → 영문 이름·설명·카테고리 초안: { ko } → { en, desc, category } (관리 탭)
// 저장하지 않는다 — 양식에 채워 줄 뿐이고, 사람이 고쳐서 [추가]/[저장]을 눌러야 목록에 들어간다.
export async function POST(req: Request) {
  const a = await requireNametagActor(true);
  if (a instanceof NextResponse) return a;
  const over = await checkAiQuota(a.supabase, a.user, ACTION);
  if (over) return over;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return badRequest('GEMINI_API_KEY가 없어요.');
  const b = (await req.json().catch(() => ({}))) as { ko?: unknown };
  const ko = typeof b.ko === 'string' ? b.ko.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (!ko) return badRequest('한글 이름을 먼저 입력해주세요.');
  try {
    const draft = await draftNametag(ko, await readCatalog(), key);
    // 사용량 상한이 이 로그 건수를 세므로 성공 시 반드시 남긴다
    await logActivity(a.supabase, a.user, ACTION, `${ko} → ${draft.en}`);
    return NextResponse.json(draft);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
