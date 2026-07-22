import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Coffee Wiki 무인 수집기(로컬 배치: yt-dlp 자막 + Claude 추출) 전용 적재 엔드포인트.
// 사용자 세션이 없으므로 비밀 토큰(x-wiki-token) + service role 클라이언트로 동작한다 (naverpay 패턴).
// 영상 1개 단위로 호출: 채널 메타 갱신 → 영상 upsert → 주장(draft) 적재 → 관계(draft) 적재.
// 신규 토픽은 topic_slug 미매칭 시 new_topic 으로 함께 제안(draft) — 승인 큐에서 확정.
// 필요 env: WIKI_INGEST_TOKEN, SUPABASE_SERVICE_ROLE_KEY

type IngestClaim = {
  topic_slug: string;                 // 기존 토픽 slug 또는 new_topic.slug 와 일치
  new_topic?: { slug: string; title: string; parent_slug?: string; description?: string };
  ts_start_sec?: number;
  ts_end_sec?: number;
  claim_ko: string;
  quote_original?: string;
  context_note?: string;
};

type IngestRelation = {
  from_index: number;                 // claims 배열 인덱스 (이번에 적재하는 주장)
  to_index?: number;                  // 같은 배열 내 다른 주장
  to_claim_id?: number;               // 또는 기존 DB 주장 id
  relation: 'agree' | 'conflict' | 'complement' | 'conditional';
  note?: string;
};

type IngestBody = {
  channel: {
    name: string;                     // wiki.channels.name 과 매칭(시드 30선)
    youtube_channel_id?: string;
    handle?: string;
    subscriber_count?: number;
  };
  video: {
    youtube_video_id: string;
    title: string;
    published_at?: string;
    duration_sec?: number;
    transcript_lang?: string;
  };
  claims: IngestClaim[];
  relations?: IngestRelation[];
  force?: boolean;                    // true면 처리 완료된 영상도 재적재(기존 draft 주장 삭제 후)
};

export async function POST(req: Request) {
  const token = process.env.WIKI_INGEST_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !serviceKey) {
    return NextResponse.json({ error: '서버에 WIKI_INGEST_TOKEN / SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다.' }, { status: 500 });
  }
  if (req.headers.get('x-wiki-token') !== token) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
  }
  if (!body?.channel?.name || !body?.video?.youtube_video_id || !Array.isArray(body.claims)) {
    return NextResponse.json({ error: 'channel.name / video.youtube_video_id / claims 필수' }, { status: 400 });
  }

  const supabase = createServiceClient(url, serviceKey, { db: { schema: 'wiki' } });

  // 1) 채널 매칭 (youtube_channel_id 우선, 없으면 이름) + 메타 갱신
  let { data: ch } = body.channel.youtube_channel_id
    ? await supabase.from('channels').select('id').eq('youtube_channel_id', body.channel.youtube_channel_id).maybeSingle()
    : { data: null };
  if (!ch) {
    ({ data: ch } = await supabase.from('channels').select('id').eq('name', body.channel.name).maybeSingle());
  }
  if (!ch) {
    return NextResponse.json({ error: `채널 미등록: ${body.channel.name} — 시드 30선에 없는 채널은 먼저 등록 필요` }, { status: 400 });
  }
  const chMeta: Record<string, unknown> = {};
  if (body.channel.youtube_channel_id) chMeta.youtube_channel_id = body.channel.youtube_channel_id;
  if (body.channel.handle) chMeta.handle = body.channel.handle;
  if (body.channel.subscriber_count) chMeta.subscriber_count = body.channel.subscriber_count;
  if (Object.keys(chMeta).length) await supabase.from('channels').update(chMeta).eq('id', ch.id);

  // 2) 영상 upsert — 이미 처리 완료면 스킵(force 시 기존 draft 삭제 후 재적재)
  const { data: existingVideo } = await supabase
    .from('videos').select('id, processed_at').eq('youtube_video_id', body.video.youtube_video_id).maybeSingle();
  let videoId: number;
  if (existingVideo) {
    if (existingVideo.processed_at && !body.force) {
      return NextResponse.json({ skipped: true, reason: '이미 처리된 영상', video_id: existingVideo.id });
    }
    videoId = existingVideo.id;
    if (body.force) await supabase.from('claims').delete().eq('video_id', videoId).eq('status', 'draft');
  } else {
    const { data: v, error: vErr } = await supabase
      .from('videos')
      .insert({
        channel_id: ch.id,
        youtube_video_id: body.video.youtube_video_id,
        title: body.video.title,
        published_at: body.video.published_at ?? null,
        duration_sec: body.video.duration_sec ?? null,
        transcript_lang: body.video.transcript_lang ?? null,
        fetched_at: new Date().toISOString(),
      })
      .select('id').single();
    if (vErr || !v) return NextResponse.json({ error: `영상 저장 실패: ${vErr?.message ?? ''}` }, { status: 500 });
    videoId = v.id;
  }

  // 3) 토픽 해석 — 미매칭 slug 는 new_topic 으로 draft 제안
  const { data: topicRows } = await supabase.from('topics').select('id, slug');
  const topicBySlug = new Map((topicRows ?? []).map((t: { id: number; slug: string }) => [t.slug, t.id]));
  let topicsProposed = 0;
  for (const c of body.claims) {
    if (topicBySlug.has(c.topic_slug)) continue;
    const nt = c.new_topic;
    if (!nt || nt.slug !== c.topic_slug) {
      return NextResponse.json({ error: `미등록 토픽 slug: ${c.topic_slug} (new_topic 필요)` }, { status: 400 });
    }
    const { data: t, error: tErr } = await supabase
      .from('topics')
      .insert({
        slug: nt.slug,
        title: nt.title,
        parent_id: nt.parent_slug ? topicBySlug.get(nt.parent_slug) ?? null : null,
        description: nt.description ?? null,
        status: 'draft',
        proposer: 'ai',
      })
      .select('id').single();
    if (tErr || !t) return NextResponse.json({ error: `토픽 제안 실패(${nt.slug}): ${tErr?.message ?? ''}` }, { status: 500 });
    topicBySlug.set(nt.slug, t.id);
    topicsProposed++;
  }

  // 4) 주장 적재 (draft)
  const claimRows = body.claims.map((c) => ({
    topic_id: topicBySlug.get(c.topic_slug)!,
    channel_id: ch!.id,
    video_id: videoId,
    ts_start_sec: c.ts_start_sec ?? null,
    ts_end_sec: c.ts_end_sec ?? null,
    claim_ko: c.claim_ko,
    quote_original: c.quote_original ?? null,
    context_note: c.context_note ?? null,
    status: 'draft',
    proposer: 'ai',
  }));
  let claimIds: number[] = [];
  if (claimRows.length) {
    const { data: inserted, error: cErr } = await supabase.from('claims').insert(claimRows).select('id');
    if (cErr || !inserted) return NextResponse.json({ error: `주장 저장 실패: ${cErr?.message ?? ''}` }, { status: 500 });
    claimIds = inserted.map((r: { id: number }) => r.id);
  }

  // 5) 관계 적재 (draft) — 인덱스/기존 id 혼용
  let relationsSaved = 0;
  for (const r of body.relations ?? []) {
    const fromId = claimIds[r.from_index];
    const toId = r.to_claim_id ?? (r.to_index != null ? claimIds[r.to_index] : undefined);
    if (!fromId || !toId || fromId === toId) continue;
    const { error: rErr } = await supabase.from('claim_relations').insert({
      from_claim_id: fromId,
      to_claim_id: toId,
      relation: r.relation,
      note: r.note ?? null,
      status: 'draft',
      proposer: 'ai',
    });
    if (!rErr) relationsSaved++;
  }

  // 6) 처리 완료 마킹
  await supabase.from('videos').update({ processed_at: new Date().toISOString() }).eq('id', videoId);

  return NextResponse.json({
    video_id: videoId,
    claims: claimIds.length,
    relations: relationsSaved,
    topicsProposed,
  });
}
