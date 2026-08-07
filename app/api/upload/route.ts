import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedEmail } from '@/lib/finance/access';

// 클라이언트가 직접 Blob 저장소에 업로드할 수 있는 토큰을 발급하는 엔드포인트
// 파일이 서버를 거치지 않아 Vercel 함수 바디 4.5MB 한도를 우회함

// 업로드를 허용하는 경로 접두사 — 데이터 JSON(data/)을 덮어쓰지 못하게 막는다
const ALLOWED_PREFIXES = ['backgrounds/', 'grind-measurements/'];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB — 컴퍼스 캡처·배경 이미지에 충분
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
        if (!isAllowedEmail(user.email)) throw new Error('팀 계정만 업로드할 수 있습니다.');
        // 경로를 클라이언트가 정하므로 접두사를 강제 — data/ 등 저장소 파일 덮어쓰기 방지.
        // Blob 키는 파일 경로가 아니라 문자열이라 접두사 검사만으로 충분하다(상위 경로 탈출 불가).
        if (!ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) {
          throw new Error('허용되지 않은 업로드 경로입니다.');
        }
        return {
          // heic/heif — iPhone 기본 카메라 포맷. 픽커가 image/* 를 받으므로 함께 허용한다
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
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
