import { put } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';

// 업로드 원본 보관 — 파일을 받는 모든 커밋 지점이 파싱 성공 후 원본을 private Blob 에 남기고
// finance.upload_originals 에 위치를 기록한다.
// 경로 규약: originals/<area>/<YYYY-MM>/<epochms>-<파일명>
//   area 예: pos-garden-yangjae · pos-garden-pangyo · pos-staffmeal ·
//            bank-excel-<brand> · bank-pdf-<brand>-<은행> · card-<brand> · receipt-coupang · bean-scan
// 목적: 파서 개선 시 재업로드 요청 없이 서버 보관본으로 재처리, 과거 자료 열람(/finance/originals).
// 실패해도 업로드 흐름을 깨지 않는다 — 보관은 부가 기능이라 항상 조용히 삼킨다.

export const ORIGINALS_PREFIX = 'originals/';

// 파일명 정리 — 경로 구분자·제어문자만 제거하고 한글 등은 보존
const safeName = (name: string) =>
  name.replace(/[/\\\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';

const kstYm = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);

export interface ArchiveMeta {
  area: string;
  ym?: string; // 자료가 속한 달 — 없으면 업로드 시점 KST 기준
  brand?: string | null;
  store?: string | null;
  note?: string | null;
}

export async function archiveOriginal(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  file: File,
  meta: ArchiveMeta,
): Promise<void> {
  try {
    const ym = meta.ym ?? kstYm();
    const path = `${ORIGINALS_PREFIX}${meta.area}/${ym}/${Date.now()}-${safeName(file.name)}`;
    const blob = await put(path, file, {
      access: 'private',
      contentType: file.type || 'application/octet-stream',
      addRandomSuffix: false,
    });
    await supabase.schema('finance').from('upload_originals').insert({
      area: meta.area,
      blob_path: blob.pathname,
      filename: file.name,
      content_type: file.type || null,
      size: file.size,
      ym,
      brand: meta.brand ?? null,
      store: meta.store ?? null,
      note: meta.note ?? null,
      uploaded_by: user.id,
      uploaded_by_email: user.email ?? null,
    });
  } catch {
    // 보관 실패는 비치명적 — 업로드 자체는 계속 진행
  }
}
