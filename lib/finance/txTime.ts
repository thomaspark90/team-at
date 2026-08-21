// 거래시각(tx_at) 저장 규약 — 이 프로젝트의 tx_at은 **KST 벽시계 시각**이다.
//
// 통장·카드·엑셀 적재는 자료에 찍힌 KST 시각을 오프셋 없이 그대로 넣고(= DB에는 UTC로 라벨링),
// 화면·전처리·집계는 전부 그 문자열을 그대로 잘라 쓴다(예: tx_at.slice(0, 10) = 거래일).
// 그런데 네이버페이·쿠팡 수집기만 '+09:00'을 붙여 진짜 UTC(=KST−9h)로 저장해 왔다(2026-08-21 발견).
// 그 결과 두 출처의 건만 화면 시각이 9시간 이르고, 15시(KST) 이후 결제는 날짜가 하루 밀려
// 분류 화면 순서는 물론 일·주 단위 지출 집계(prepExpense.bucketOf, aggregate.periodKey)까지 틀어졌다.
//
// 그래서 모든 수집기가 이 함수 하나로 규약을 맞춘다: 무엇이 들어오든 KST 벽시계 문자열로.
// 새 수집기를 붙일 때도 tx_at은 반드시 이 함수를 거칠 것.
export function toKstWallClock(input: string): string {
  const t = input.trim().replace(' ', 'T');
  // 날짜만 오면 자정으로
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00`;
  // 타임존이 붙어 있으면 KST 벽시계로 환산한 뒤 오프셋을 뗀다
  const m = t.match(/(Z|[+-]\d{2}:?\d{2})$/i);
  if (m) {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return t.slice(0, m.index); // 파싱 실패 시 오프셋만 제거
    return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 19);
  }
  return t; // 이미 오프셋 없는 KST 벽시계
}
