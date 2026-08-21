// PostgREST max-rows 안전 페이지 로더 (2026-08-21 감사 P0).
//
// supabase-js 의 `.limit(50000)` 은 잘림 방어가 아니다 — 프로젝트 Max Rows(서버 상한)가
// limit 보다 작으면 응답이 조용히 그 상한에서 잘린다(2026-08-04 지표 매출 0 사고의 원인).
// 이 로더는 `.range()` 로 나눠 받되 **실제 반환 길이만큼만 전진**하므로, 서버 상한이
// 요청 페이지보다 작아도 전량을 이어 받는다. 종료 조건은 '0행'뿐 — 상한과 페이지 크기가
// 어긋나도 절대 조기 종료하지 않는다.
//
// ⚠ 호출부는 반드시 유일 키 정렬(.order('id') 등)을 걸어야 한다 — 정렬 없는 range 는
// 페이지 경계에서 행이 중복·누락될 수 있다.

// data 는 unknown[] 로 받아 T[] 로 캐스팅한다 — supabase 의 조인 타입 추론(categories 를 배열로
// 추론하는 버릇)과 싸우지 않기 위함. select 문자열과 T 의 일치는 호출부 책임(기존 캐스팅과 동일).
interface PageResult {
  data: unknown[] | null;
  error: { message: string; code?: string } | null;
}

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult>,
  opts?: {
    /** 한 번에 요청할 행 수 — 서버 상한보다 커도 안전하지만, 상한 이하로 두면 요청 수가 예측된다 */
    page?: number;
    /** 에러 메시지에 붙는 이름 */
    label?: string;
    /** true 면 '테이블 없음'(PGRST205/42P01)은 빈 배열로 삼킨다 — 마이그레이션 전 환경 허용 */
    missingTableOk?: boolean;
  }
): Promise<T[]> {
  const page = opts?.page ?? 1000;
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + page - 1);
    if (error) {
      if (opts?.missingTableOk && (error.code === 'PGRST205' || error.code === '42P01')) return out;
      throw new Error(`${opts?.label ?? '데이터'} 조회 실패: ${error.message}`);
    }
    const rows = (data ?? []) as T[];
    if (rows.length === 0) break;
    out.push(...rows);
    from += rows.length;
  }
  return out;
}
