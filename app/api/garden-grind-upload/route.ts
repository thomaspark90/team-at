import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 분쇄도 측정 이미지 서버 경유 업로드 — 클라이언트가 Blob 저장소에 직접 올리던 방식이
// 한국에서 접속 시 저장소까지의 물리적 거리 때문에 계속 느렸다(2026-08-08~09 대표 지적,
// 압축·병렬화 후에도 여전히 오래 걸림). 클라이언트→가까운 icn1 함수 구간만 사용자 회선을
// 타고, 함수→Blob 구간은 Vercel 내부망을 타므로 훨씬 빠르다. 원래 직접 업로드를 쓴 이유는
// 서버 함수 바디 4.5MB 한도 우회였는데, 이미지가 이제 압축돼(수백 KB) 문제되지 않는다.
const MAX_BYTES = 4 * 1024 * 1024; // 압축 후 파일 기준 넉넉히 — 함수 바디 4.5MB 한도 안쪽

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(supabase, user, 'calibration');
  if (denied) return denied;

  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
  for (const f of files) {
    if (!f.type.startsWith('image/')) return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요.' }, { status: 400 });
    if (f.size > MAX_BYTES) return NextResponse.json({ error: `파일이 너무 큽니다 (${f.name}).` }, { status: 400 });
  }

  try {
    const uploaded = await Promise.all(
      files.map((f, i) =>
        put(`grind-measurements/${Date.now()}-${i}-${f.name}`, f, {
          access: 'public',
          addRandomSuffix: false,
          contentType: f.type,
        }),
      ),
    );
    return NextResponse.json({ urls: uploaded.map((b) => b.url) });
  } catch (e) {
    return NextResponse.json({ error: `업로드 실패: ${(e as Error).message}` }, { status: 500 });
  }
}
