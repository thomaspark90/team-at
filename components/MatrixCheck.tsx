// 사람 × 칸 표의 체크 칸 — 설정 › 계정의 권한 표와 가든 설정의 「필터커피 내리는 사람」 표가 같이 쓴다.
// on/off = 누를 수 있는 칸, locked = 항상 켜짐(흐리게), na = 그 사람에게는 지정할 수 없음(–).

export type MatrixCellState = 'on' | 'off' | 'locked' | 'na';

export default function MatrixCheck({ state, dim = false }: { state: MatrixCellState; dim?: boolean }) {
  if (state === 'na') return <span className="text-muted-foreground" style={{ opacity: 0.4 }}>–</span>;
  const on = state !== 'off';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: 5,
        fontSize: 12,
        lineHeight: 1,
        border: on ? 'none' : '1.5px solid hsl(var(--muted-foreground) / 0.45)',
        background: on ? 'hsl(var(--foreground))' : 'transparent',
        color: 'hsl(var(--background))',
        opacity: state === 'locked' ? 0.35 : dim ? 0.3 : 1,
      }}
    >
      {on ? '✓' : ''}
    </span>
  );
}
