import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

// 네이버페이 자동 수집 설정 — 크롤링 주소를 웹에서 확인·변경한다.
// 저장은 Vercel Blob(JSON), 수집기(로컬 Mac)는 매 실행 시작 때 GET으로 읽어간다.
// GET: 로그인 사용자(admin/classifier) 또는 수집기 토큰(x-naverpay-token).
// PUT: 로그인 사용자만. 주소는 pay.naver.com 으로 제한(오입력 방지).

const DATA_PATH = 'data/naverpay-config.json';
const DEFAULT_URL = 'https://pay.naver.com/pc/history?page=1';

type Cfg = { historyUrl: string; updatedAt: string; updatedBy: string | null };

async function readCfg(): Promise<Cfg | null> {
  try {
    const res = await get(DATA_PATH, { access: 'private', useCache: false });
    if (!res) return null;
    return JSON.parse(await new Response(res.stream).text()) as Cfg;
  } catch {
    return null;
  }
}

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return { error: NextResponse.json({ error: '회계 입력 권한이 없습니다.' }, { status: 403 }) };
  }
  return { user };
}

export async function GET(req: Request) {
  const token = process.env.NAVERPAY_INGEST_TOKEN;
  const viaScraper = !!token && req.headers.get('x-naverpay-token') === token;
  if (!viaScraper) {
    const auth = await requireStaff();
    if ('error' in auth) return auth.error;
  }
  const cfg = await readCfg();
  return NextResponse.json({
    historyUrl: cfg?.historyUrl || DEFAULT_URL,
    defaultUrl: DEFAULT_URL,
    isDefault: !cfg?.historyUrl || cfg.historyUrl === DEFAULT_URL,
    updatedAt: cfg?.updatedAt ?? null,
  });
}

export async function PUT(req: Request) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;

  let historyUrl = '';
  try {
    const body = await req.json();
    historyUrl = String(body?.historyUrl ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
  }
  if (!historyUrl) historyUrl = DEFAULT_URL; // 빈 값 = 기본값 복원

  try {
    const u = new URL(historyUrl);
    if (u.protocol !== 'https:' || u.hostname !== 'pay.naver.com') throw new Error();
  } catch {
    return NextResponse.json({ error: '주소는 https://pay.naver.com/… 형식이어야 해요.' }, { status: 400 });
  }

  const cfg: Cfg = { historyUrl, updatedAt: new Date().toISOString(), updatedBy: auth.user.email ?? null };
  await put(DATA_PATH, JSON.stringify(cfg), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return NextResponse.json({ historyUrl, isDefault: historyUrl === DEFAULT_URL, updatedAt: cfg.updatedAt });
}
