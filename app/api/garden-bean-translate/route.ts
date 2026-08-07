import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { translateBeanName } from '@/lib/garden-bean-translate';

// 한글 원두명 → 영문 표기: { bean } → { beanEn }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY가 없어요.' }, { status: 400 });

  const { bean } = await req.json();
  if (!bean || !String(bean).trim()) {
    return NextResponse.json({ error: '원두명을 먼저 입력해주세요.' }, { status: 400 });
  }

  try {
    const beanEn = await translateBeanName(String(bean).trim(), key);
    return NextResponse.json({ beanEn });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
