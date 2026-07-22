'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  RELATION_LABEL,
  formatTs,
  youtubeUrl,
  type RelationType,
  type WikiTopic,
} from '@/lib/wiki/types';

// 커피 위키 열람 — 토픽별 승인된 주장 + 교차검증(관계) 표시.

type BrowseClaim = {
  id: number;
  topic_id: number;
  ts_start_sec: number | null;
  claim_ko: string;
  quote_original: string | null;
  context_note: string | null;
  video: { youtube_video_id: string; title: string; published_at: string | null } | null;
  channel: { name: string; is_retailer: boolean; is_star: boolean } | null;
};

type BrowseRelation = {
  id: number;
  from_claim_id: number;
  to_claim_id: number;
  relation: RelationType;
  note: string | null;
};

export default function WikiBrowser() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<WikiTopic[]>([]);
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const [draftCount, setDraftCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [claims, setClaims] = useState<BrowseClaim[]>([]);
  const [relations, setRelations] = useState<BrowseRelation[]>([]);

  useEffect(() => {
    (async () => {
      const [topicsRes, countRes, draftRes] = await Promise.all([
        supabase.schema('wiki').from('topics').select('*').eq('status', 'approved').order('sort').order('title'),
        supabase.schema('wiki').from('claims').select('topic_id').eq('status', 'approved'),
        supabase.schema('wiki').from('claims').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      ]);
      const err = topicsRes.error ?? countRes.error;
      if (err) {
        setError(err.message);
      } else {
        setTopics((topicsRes.data ?? []) as WikiTopic[]);
        const m = new Map<number, number>();
        (countRes.data ?? []).forEach((r: { topic_id: number }) => m.set(r.topic_id, (m.get(r.topic_id) ?? 0) + 1));
        setCounts(m);
        setDraftCount(draftRes.count ?? 0);
      }
      setLoading(false);
    })();
  }, [supabase]);

  const loadTopic = useCallback(
    async (topicId: number) => {
      setSelected(topicId);
      const { data, error: e } = await supabase
        .schema('wiki')
        .from('claims')
        .select('id, topic_id, ts_start_sec, claim_ko, quote_original, context_note, video:videos(youtube_video_id, title, published_at), channel:channels(name, is_retailer, is_star)')
        .eq('status', 'approved')
        .eq('topic_id', topicId)
        .order('channel_id');
      if (e) {
        setError(e.message);
        return;
      }
      const list = (data ?? []) as unknown as BrowseClaim[];
      setClaims(list);
      const ids = list.map((c) => c.id);
      if (ids.length === 0) {
        setRelations([]);
        return;
      }
      const { data: rels } = await supabase
        .schema('wiki')
        .from('claim_relations')
        .select('id, from_claim_id, to_claim_id, relation, note')
        .eq('status', 'approved')
        .in('from_claim_id', ids);
      setRelations((rels ?? []) as BrowseRelation[]);
    },
    [supabase]
  );

  const claimById = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);
  const relationsByClaim = useMemo(() => {
    const m = new Map<number, { rel: BrowseRelation; other: BrowseClaim | undefined }[]>();
    relations.forEach((r) => {
      [
        [r.from_claim_id, r.to_claim_id],
        [r.to_claim_id, r.from_claim_id],
      ].forEach(([self, other]) => {
        if (!claimById.has(self)) return;
        const arr = m.get(self) ?? [];
        arr.push({ rel: r, other: claimById.get(other) });
        m.set(self, arr);
      });
    });
    return m;
  }, [relations, claimById]);

  if (loading) return <p className="text-[13px] text-muted-foreground">불러오는 중…</p>;
  if (error) return <p className="text-[13px] text-destructive">{error}</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">유튜버 30선 영상에서 추출·승인된 주장을 토픽별로 교차검증합니다.</p>
        <Link href="/garden/wiki/review" className="text-[13px] underline text-muted-foreground hover:text-foreground">
          승인 큐{draftCount > 0 ? ` (${draftCount})` : ''} →
        </Link>
      </div>
      <div className="flex flex-col gap-6 md:flex-row">
        {/* 토픽 목록 */}
        <aside className="md:w-[220px] md:shrink-0">
          <ul className="space-y-1">
            {topics.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => loadTopic(t.id)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                    selected === t.id ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {t.title}
                  <span className="tabular float-right">{counts.get(t.id) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* 주장 목록 */}
        <div className="min-w-0 flex-1">
          {selected == null && <p className="text-[13px] text-muted-foreground">토픽을 선택하세요.</p>}
          {selected != null && claims.length === 0 && <p className="text-[13px] text-muted-foreground">이 토픽에 승인된 주장이 아직 없습니다.</p>}
          <ul className="space-y-4">
            {claims.map((c) => (
              <li key={c.id} className="ta-card bg-background">
                <p className="mb-1 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{c.channel?.name}</span>
                  {c.channel?.is_star ? ' ⭐' : ''}
                  {c.channel?.is_retailer ? ' · 리테일러(편향 감안)' : ''}
                  {c.video && (
                    <>
                      {' · '}
                      <a href={youtubeUrl(c.video.youtube_video_id, c.ts_start_sec)} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                        {c.video.title}{c.ts_start_sec != null ? ` (${formatTs(c.ts_start_sec)})` : ''} ↗
                      </a>
                    </>
                  )}
                </p>
                <p className="text-[13px]">{c.claim_ko}</p>
                {c.quote_original && <p className="mt-1 text-[11px] text-muted-foreground">“{c.quote_original}”</p>}
                {c.context_note && <p className="mt-1 text-[11px] text-muted-foreground">전제: {c.context_note}</p>}
                {(relationsByClaim.get(c.id) ?? []).map(({ rel, other }) => (
                  <p key={`${rel.id}-${c.id}`} className={`mt-2 text-[11px] ${rel.relation === 'conflict' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    [{RELATION_LABEL[rel.relation]}] {other?.channel?.name}: {other?.claim_ko}
                    {rel.note ? ` — ${rel.note}` : ''}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
