import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractBeanBagInfo } from '@/lib/garden-bean-scan';
import { logActivity } from '@/lib/finance/activity';
import { checkAiQuota } from '@/lib/access/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 원두봉투 사진 → Gemini 추출 → 원두 정보(원두명·로스팅사·용량·배전도·노트) 미리보기 반환.
// 저장은 사용자가 폼에서 확인·수정 후 기존 /api/purchases POST 로.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const over = await checkAiQuota(supabase, user, '원두봉투 AI 인식');
  if (over) return over;

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 없어요.' }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '이미지를 선택하세요.' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요.' }, { status: 400 });
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const extraction = await extractBeanBagInfo(base64, file.type, key);
    await logActivity(supabase, user, '원두봉투 AI 인식', extraction.beanName ?? '(원두명 미인식)');
    return NextResponse.json({ extraction });
  } catch (e) {
    return NextResponse.json(
      { error: `이미지를 읽지 못했어요: ${(e as Error).message}` },
      { status: 400 }
    );
  }
}
