// 발주 화면 공통 표기.
export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
export const jsonInit = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
