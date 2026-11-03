import type { InternalDoc } from '@/lib/docs/types';
import { legalDefenseGuide } from '@/lib/docs/content/legal-defense-guide';

// 내부 공유 문서 목록 — 새 문서는 lib/docs/content/ 에 파일을 만들고 여기에 한 줄 추가.
// version: 공유 링크 세대. 올리면 그 문서의 기존 링크가 즉시 무효가 된다(유출 시 회수용).
export const INTERNAL_DOCS: { doc: InternalDoc; version: number }[] = [{ doc: legalDefenseGuide, version: 1 }];
