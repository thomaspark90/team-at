import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_DUTY_TAGS, DEFAULT_ROLES, type TagDef, type TagKind } from './types';

// 역할·책임 태그 목록 — finance.schedule_tags. 표가 비어 있으면 코드 기본값(시드와 같다).
export async function loadTags(svc: SupabaseClient, kind: TagKind): Promise<TagDef[]> {
  const { data, error } = await svc.from('schedule_tags').select('key, label, color').eq('kind', kind).order('position');
  if (error) throw new Error(error.message);
  if (!data?.length) return kind === 'role' ? DEFAULT_ROLES : DEFAULT_DUTY_TAGS;
  return data.map((t) => ({ key: t.key as string, label: t.label as string, ...(t.color ? { color: t.color as string } : {}) }));
}

/** 새 태그 키 — 짧고 겹치지 않게. 저장되면 바꾸지 않는다. */
export const newTagKey = (kind: TagKind): string => `${kind === 'role' ? 'r' : 'd'}_${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
