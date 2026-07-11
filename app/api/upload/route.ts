import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 클라이언트가 직접 Blob 저장소에 업로드할 수 있는 토큰을 발급하는 엔드포인트
// 파일이 서버를 거치지 않아 Vercel 함수 바디 4.5MB 한도를 우회함
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      // 토큰 발급 직전에만 로그인 확인 — 라우트 전체를 잠그면 Blob 완료 웹훅(쿠키 없음)이 깨짐
      onBeforeGenerateToken: async (pathname) => {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다.');
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('Upload completed:', blob.url);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
