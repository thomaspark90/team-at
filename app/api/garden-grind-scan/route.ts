import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractGrindCompassInfo } from '@/lib/garden-grind-scan';
import { logActivity } from '@/lib/finance/activity';
import { checkAiQuota } from '@/lib/access/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 컴퍼스 결과 캡처 → Gemini 추출 → 측정 수치(다이얼·평균·표준편차·미분) 미리보기 반환.
// 저장은 사용자가 폼에서 확인·수정 후 기존 /api/garden-grind-measurements POST 로.
// 원두봉투 스캔(garden-bean-scan)과 동일 구조.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const over = await checkAiQuota(supabase, user, '컴퍼스 결과 AI 인식');
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
    const extraction = await extractGrindCompassInfo(base64, file.type, key);
    await logActivity(
      supabase,
      user,
      '컴퍼스 결과 AI 인식',
      extraction.meanUm != null ? `평균 ${extraction.meanUm}µm` : '(평균 미인식)',
    );
    return NextResponse.json({ extraction });
  } catch (e) {
    return NextResponse.json({ error: `이미지를 읽지 못했어요: ${(e as Error).message}` }, { status: 400 });
  }
}
