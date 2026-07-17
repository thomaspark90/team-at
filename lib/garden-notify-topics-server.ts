// 서버 전용 — 가든 알림 토픽 담당자 맵의 Blob 저장/조회. 클라이언트에서 import 금지.
import { get, put } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GardenTopicId, GardenTopicMap } from './garden-notify-topics';
import { EMPTY_TOPICS } from './garden-notify-topics';
import { recipientEmails } from './notify';

const DATA_PATH = 'data/garden-notify-topics.json';

export async function readGardenTopics(): Promise<GardenTopicMap> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { ...EMPTY_TOPICS };
  const text = await new Response(res.stream).text();
  try {
    return { ...EMPTY_TOPICS, ...(JSON.parse(text) as Partial<GardenTopicMap>) };
  } catch {
    return { ...EMPTY_TOPICS };
  }
}

export async function writeGardenTopics(map: GardenTopicMap) {
  await put(DATA_PATH, JSON.stringify(map), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// 토픽 담당자 이메일 — 미지정 토픽은 원두 알림 수신자로 폴백 (요청류가 허공에 사라지지 않게)
export async function topicEmails(supabase: SupabaseClient, topic: GardenTopicId): Promise<string[]> {
  const map = await readGardenTopics();
  const assigned = map[topic] ?? [];
  if (assigned.length > 0) return assigned;
  return recipientEmails(supabase, 'stock');
}
