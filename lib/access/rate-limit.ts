import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// AI 호출 사용량 제한 — Gemini/OCR 라우트는 로그인만 되면 호출되고 건당 비용이 나간다.
// 실수든 폭주든 요금이 무한정 늘지 않게 사용자·기능별로 하루 상한을 둔다.
//
// 저장은 finance.activity_logs 를 그대로 쓴다(별도 테이블·마이그레이션 불필요).
// 각 AI 라우트가 이미 logActivity 로 흔적을 남기므로, 같은 action 의 오늘치 건수를 센다.
// 정확한 원자적 카운터는 아니지만(동시 호출 시 상한을 살짝 넘을 수 있음),
// 목적이 "폭주 차단"이라 이 정도 오차는 허용된다.

export const AI_DAILY_LIMIT = 100;

const kstDayStartUtc = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const dayStartKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return new Date(dayStartKst - 9 * 3600_000).toISOString();
};

/** 오늘(KST) 이 사용자의 해당 action 호출이 상한을 넘었으면 429 응답을 돌려준다. */
export async function checkAiQuota(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  action: string,
  limit: number = AI_DAILY_LIMIT
): Promise<NextResponse | null> {
  try {
    const { count, error } = await supabase
      .schema('finance')
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', action)
      .gte('created_at', kstDayStartUtc());
    // 집계 자체가 실패하면 기능을 막지 않는다 — 상한은 안전장치이지 필수 경로가 아니다
    if (error || count == null) return null;
    if (count >= limit) {
      return NextResponse.json(
        { error: `오늘 이 기능의 사용 한도(${limit}회)를 넘었어요. 내일 다시 시도해 주세요.` },
        { status: 429 }
      );
    }
  } catch {
    return null;
  }
  return null;
}
