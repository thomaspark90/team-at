'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  RELATION_LABEL,
  formatTs,
  youtubeUrl,
  type RelationType,
  type WikiTopic,
} from '@/lib/wiki/types';

// 승인 큐 — AI 추출 draft(주장/토픽/관계)를 검토·승인/반려한다.
// 처리량 완화 장치: 영상 단위 일괄 승인 + 상충(conflict) 관계 걸린 주장만 개별 검토 유도.

type QueueClaim = {
  id: number;
  topic_id: number;
  ts_start_sec: number | null;
  claim_ko: string;
  quote_original: string | null;
  context_note: string | null;
  video: { id: number; youtube_video_id: string; title: string } | null;
  channel: { name: string } | null;
};

type QueueRelation = {
  id: number;
  relation: RelationType;
  note: string | null;
  from: { id: number; claim_ko: string; status: string } | null;
  to: { id: number; claim_ko: string; status: string } | null;
};

export default function WikiReviewQueue() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<QueueClaim[]>([]);
  const [topics, setTopics] = useState<WikiTopic[]>([]);
  const [draftTopics, setDraftTopics] = useState<WikiTopic[]>([]);
  const [relations, setRelations] = useState<QueueRelation[]>([]);
  const [edited, setEdited] = useState<Record<number, { claim_ko?: string; topic_id?: number }>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [claimsRes, topicsRes, relationsRes] = await Promise.all([
      supabase
        .schema('wiki')
        .from('claims')
        .select('id, topic_id, ts_start_sec, claim_ko, quote_original, context_note, video:videos(id, youtube_video_id, title), channel:channels(name)')
        .eq('status', 'draft')
        .order('video_id')
        .order('ts_start_sec'),
      supabase.schema('wiki').from('topics').select('*').order('sort').order('title'),
      supabase
        .schema('wiki')
        .from('claim_relations')
        .select('id, relation, note, from:claims!from_claim_id(id, claim_ko, status), to:claims!to_claim_id(id, claim_ko, status)')
        .eq('status', 'draft'),
    ]);
    const err = claimsRes.error ?? topicsRes.error ?? relationsRes.error;
    if (err) {
      setError(err.message);
    } else {
      setClaims((claimsRes.data ?? []) as unknown as QueueClaim[]);
      const all = (topicsRes.data ?? []) as WikiTopic[];
      setTopics(all.filter((t) => t.status === 'approved'));
      setDraftTopics(all.filter((t) => t.status === 'draft'));
      setRelations((relationsRes.data ?? []) as unknown as QueueRelation[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // 상충 관계에 걸린 주장 id — 일괄 승인 시에도 개별 확인 유도
  const conflictClaimIds = useMemo(() => {
    const s = new Set<number>();
    relations.forEach((r) => {
      if (r.relation === 'conflict') {
        if (r.from) s.add(r.from.id);
        if (r.to) s.add(r.to.id);
      }
    });
    return s;
  }, [relations]);

  const byVideo = useMemo(() => {
    const groups = new Map<number, { video: NonNullable<QueueClaim['video']>; channel: string; items: QueueClaim[] }>();
    claims.forEach((c) => {
      if (!c.video) return;
      const g = groups.get(c.video.id) ?? { video: c.video, channel: c.channel?.name ?? '', items: [] };
      g.items.push(c);
      groups.set(c.video.id, g);
    });
    return Array.from(groups.values());
  }, [claims]);

  async function review(table: 'claims' | 'topics' | 'claim_relations', ids: number[], status: 'approved' | 'rejected') {
    if (ids.length === 0) return;
    setBusy(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error: e } = await supabase
      .schema('wiki')
      .from(table)
      .update({ status, reviewed_by: userRes.user?.id ?? null, reviewed_at: new Date().toISOString() })
      .in('id', ids);
    if (e) setError(e.message);
    await load();
    setBusy(false);
  }

  // 수정 후 승인 — 편집된 claim_ko/topic_id 반영해서 승인
  async function approveClaim(c: QueueClaim) {
    setBusy(true);
    const patch = edited[c.id];
    const { data: userRes } = await supabase.auth.getUser();
    const { error: e } = await supabase
      .schema('wiki')
      .from('claims')
      .update({
        ...(patch?.claim_ko != null ? { claim_ko: patch.claim_ko } : {}),
        ...(patch?.topic_id != null ? { topic_id: patch.topic_id } : {}),
        status: 'approved',
        reviewed_by: userRes.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id);
    if (e) setError(e.message);
    await load();
    setBusy(false);
  }

  if (loading) return <p className="text-[13px] text-muted-foreground">불러오는 중…</p>;

  return (
    <div className="space-y-8">
      {error && <p className="text-[13px] text-destructive">{error}</p>}

      {/* 토픽 제안 */}
      {draftTopics.length > 0 && (
        <section className="ta-card bg-background">
          <p className="ta-label mb-3">토픽 제안 ({draftTopics.length})</p>
          <ul className="space-y-2">
            {draftTopics.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                <span className="text-[13px]">
                  {t.title} <span className="text-muted-foreground">/{t.slug}</span>
                </span>
                <span className="flex gap-2">
                  <button className="ta-btn h-7 px-2 text-[11px]" disabled={busy} onClick={() => review('topics', [t.id], 'approved')}>승인</button>
                  <button className="ta-btn h-7 px-2 text-[11px] text-destructive" disabled={busy} onClick={() => review('topics', [t.id], 'rejected')}>반려</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 주장 — 영상 단위 그룹 */}
      {byVideo.length === 0 && draftTopics.length === 0 && relations.length === 0 && (
        <p className="text-[13px] text-muted-foreground">검토 대기 항목이 없습니다. 수집 배치가 적재하면 여기에 쌓입니다.</p>
      )}
      {byVideo.map(({ video, channel, items }) => {
        const safe = items.filter((c) => !conflictClaimIds.has(c.id));
        return (
          <section key={video.id} className="ta-card bg-background">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[15px]">{channel} — {video.title}</p>
                <a href={youtubeUrl(video.youtube_video_id)} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground underline hover:text-foreground">
                  영상 보기 ↗ · 주장 {items.length}건{conflictClaimIds.size > 0 && safe.length !== items.length ? ` (상충 ${items.length - safe.length}건 제외 일괄 가능)` : ''}
                </a>
              </div>
              <span className="flex gap-2">
                <button className="ta-btn-primary h-8 px-3 text-[13px]" disabled={busy || safe.length === 0} onClick={() => review('claims', safe.map((c) => c.id), 'approved')}>
                  일괄 승인 ({safe.length})
                </button>
                <button className="ta-btn h-8 px-3 text-[13px] text-destructive" disabled={busy} onClick={() => review('claims', items.map((c) => c.id), 'rejected')}>
                  전체 반려
                </button>
              </span>
            </div>
            <ul className="space-y-4">
              {items.map((c) => (
                <li key={c.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {c.ts_start_sec != null && (
                      <a href={youtubeUrl(video.youtube_video_id, c.ts_start_sec)} target="_blank" rel="noreferrer" className="tabular underline hover:text-foreground">
                        {formatTs(c.ts_start_sec)} ↗
                      </a>
                    )}
                    <select
                      className="ta-input h-7 w-auto px-2 text-[11px]"
                      value={edited[c.id]?.topic_id ?? c.topic_id}
                      onChange={(e) => setEdited((p) => ({ ...p, [c.id]: { ...p[c.id], topic_id: Number(e.target.value) } }))}
                    >
                      {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                    {conflictClaimIds.has(c.id) && <span className="text-destructive">상충 관계 — 개별 검토</span>}
                  </div>
                  <textarea
                    className="ta-input min-h-[52px] w-full py-2"
                    value={edited[c.id]?.claim_ko ?? c.claim_ko}
                    onChange={(e) => setEdited((p) => ({ ...p, [c.id]: { ...p[c.id], claim_ko: e.target.value } }))}
                  />
                  {c.quote_original && <p className="mt-1 text-[11px] text-muted-foreground">“{c.quote_original}”</p>}
                  {c.context_note && <p className="mt-1 text-[11px] text-muted-foreground">전제: {c.context_note}</p>}
                  <div className="mt-2 flex gap-2">
                    <button className="ta-btn h-7 px-2 text-[11px]" disabled={busy} onClick={() => approveClaim(c)}>승인</button>
                    <button className="ta-btn h-7 px-2 text-[11px] text-destructive" disabled={busy} onClick={() => review('claims', [c.id], 'rejected')}>반려</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* 관계 제안 */}
      {relations.length > 0 && (
        <section className="ta-card bg-background">
          <p className="ta-label mb-3">관계 제안 ({relations.length})</p>
          <ul className="space-y-3">
            {relations.map((r) => (
              <li key={r.id} className="border-b border-border pb-3 last:border-0">
                <p className="text-[13px]">
                  <span className={`mr-2 ${r.relation === 'conflict' ? 'text-destructive' : 'text-muted-foreground'}`}>[{RELATION_LABEL[r.relation]}]</span>
                  {r.from?.claim_ko}
                  <span className="mx-1 text-muted-foreground">↔</span>
                  {r.to?.claim_ko}
                </p>
                {r.note && <p className="mt-1 text-[11px] text-muted-foreground">{r.note}</p>}
                <div className="mt-2 flex gap-2">
                  <button className="ta-btn h-7 px-2 text-[11px]" disabled={busy} onClick={() => review('claim_relations', [r.id], 'approved')}>승인</button>
                  <button className="ta-btn h-7 px-2 text-[11px] text-destructive" disabled={busy} onClick={() => review('claim_relations', [r.id], 'rejected')}>반려</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
