import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { RoasteryAssets } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';

// 로스터리별 원두카드 이미지(로고·QR) — 설정에서 업로드, 카드 인쇄 시 자동 배치
const DATA_PATH = 'data/garden-roastery-assets.json';

async function readAssets(): Promise<RoasteryAssets> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return {};
  try {
    return JSON.parse(await new Response(res.stream).text()) as RoasteryAssets;
  } catch {
    return {};
  }
}

async function writeAssets(assets: RoasteryAssets) {
  await put(DATA_PATH, JSON.stringify(assets), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  return NextResponse.json(await readAssets());
}

// 이미지 업로드: multipart form { roastery, kind: 'logo'|'qr', file }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const fd = await req.formData();
  const roastery = String(fd.get('roastery') ?? '').trim();
  const kind = String(fd.get('kind') ?? '');
  const file = fd.get('file');
  if (!roastery || (kind !== 'logo' && kind !== 'qr') || !(file instanceof File)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  // 카드의 <img>가 바로 읽을 수 있게 public 업로드 (랜덤 접미사로 캐시 무효화)
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const blob = await put(`assets/roastery/${kind}.${ext}`, file, {
    access: 'public',
    addRandomSuffix: true,
  });

  const assets = await readAssets();
  assets[roastery] = { ...assets[roastery], [kind]: blob.url };
  await writeAssets(assets);
  return NextResponse.json(assets);
}

// 이미지 제거: { roastery, kind }
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roastery, kind } = await req.json();
  const assets = await readAssets();
  if (assets[roastery]) {
    delete assets[roastery][kind as 'logo' | 'qr'];
    if (!assets[roastery].logo && !assets[roastery].qr) delete assets[roastery];
    await writeAssets(assets);
  }
  return NextResponse.json(assets);
}
