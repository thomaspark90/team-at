// Coffee Wiki 타입 — supabase/migration_wiki.sql 스키마와 1:1 (설계: docs/coffee-wiki-spec.md)

export type ReviewStatus = 'draft' | 'approved' | 'rejected';
export type RelationType = 'agree' | 'conflict' | 'complement' | 'conditional';
export type ProposerKind = 'ai' | 'member' | 'external';

export const RELATION_LABEL: Record<RelationType, string> = {
  agree: '동의',
  conflict: '상충',
  complement: '보완',
  conditional: '조건부',
};

export interface WikiChannel {
  id: number;
  youtube_channel_id: string | null;
  handle: string | null;
  name: string;
  host_name: string | null;
  subscriber_count: number | null;
  tags: string[];
  is_retailer: boolean;
  is_star: boolean;
  language: string;
  active: boolean;
  note: string | null;
}

export interface WikiVideo {
  id: number;
  channel_id: number;
  youtube_video_id: string;
  title: string;
  published_at: string | null;
  duration_sec: number | null;
  transcript_lang: string | null;
  fetched_at: string | null;
  processed_at: string | null;
}

export interface WikiTopic {
  id: number;
  slug: string;
  title: string;
  parent_id: number | null;
  description: string | null;
  status: ReviewStatus;
  proposer: ProposerKind;
  sort: number;
}

export interface WikiClaim {
  id: number;
  topic_id: number;
  channel_id: number;
  video_id: number;
  ts_start_sec: number | null;
  ts_end_sec: number | null;
  claim_ko: string;
  quote_original: string | null;
  context_note: string | null;
  status: ReviewStatus;
  proposer: ProposerKind;
  created_at: string;
}

export interface WikiClaimRelation {
  id: number;
  from_claim_id: number;
  to_claim_id: number;
  relation: RelationType;
  note: string | null;
  status: ReviewStatus;
}

// 영상 구간 초 → "12:34" 표기
export function formatTs(sec: number | null | undefined): string {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function youtubeUrl(videoId: string, tsSec?: number | null): string {
  return `https://youtu.be/${videoId}${tsSec ? `?t=${tsSec}` : ''}`;
}
