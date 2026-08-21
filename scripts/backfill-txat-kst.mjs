// 네이버페이·쿠팡 tx_at 백필 — 진짜 UTC로 저장돼 있던 과거 적재분을 KST 벽시계 축(+9h)으로 옮긴다.
// 규약: lib/finance/txTime.ts (tx_at = KST 벽시계). 수집기 규약 통일 배포 이후 1회성 실행.
//
//   node scripts/backfill-txat-kst.mjs check     현황만 (변경 없음)
//   node scripts/backfill-txat-kst.mjs apply     백업 테이블 생성 후 백필
//   node scripts/backfill-txat-kst.mjs revert    백업 테이블로 원복
//
// 상한(id) 스냅샷을 백업 테이블에 함께 남겨, 배포 이후 새 규약으로 들어온 행은 절대 건드리지 않는다.
import pg from 'pg';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const BACKUP = 'finance.tx_at_backfill_20260821';
const SRC = "source in ('naverpay','coupang')";
const mode = process.argv[2] ?? 'check';

const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p) => (await c.query(sql, p)).rows;

const summary = async (label) => {
  const [s] = await q(`select count(*) n, sum(amount_in) sin, sum(amount_out) sout,
      count(*) filter (where ym <> to_char(tx_at at time zone 'UTC','YYYY-MM')) ym_mismatch
    from finance.transactions where ${SRC}`);
  console.log(`[${label}] 건수 ${s.n} / 입금합 ${s.sin} / 출금합 ${s.sout} / ym 불일치 ${s.ym_mismatch}`);
  return s;
};

if (mode === 'check') {
  await summary('현황');
  console.log(await q(`select to_char(tx_at at time zone 'UTC','YYYY-MM-DD HH24:MI') 현재표시,
      to_char((tx_at + interval '9 hours') at time zone 'UTC','YYYY-MM-DD HH24:MI') 백필후, source, left(memo,12) memo
    from finance.transactions where ${SRC} order by tx_at desc limit 5`));
} else if (mode === 'apply') {
  const [{ max }] = await q(`select max(id) from finance.transactions where ${SRC}`);
  const before = await summary('백필 전');
  await q(`create table if not exists ${BACKUP} (id bigint primary key, tx_at timestamptz not null, max_id bigint not null)`);
  const [{ n: already }] = await q(`select count(*) n from ${BACKUP}`);
  if (Number(already) > 0) {
    console.log(`백업 테이블에 이미 ${already}행 — 중복 실행으로 판단해 중단합니다(원복은 revert).`);
    process.exit(1);
  }
  await q(`insert into ${BACKUP} (id, tx_at, max_id) select id, tx_at, $1 from finance.transactions where ${SRC} and id <= $1`, [max]);
  const [{ n: saved }] = await q(`select count(*) n from ${BACKUP}`);
  const upd = await c.query(`update finance.transactions t set tx_at = t.tx_at + interval '9 hours'
    from ${BACKUP} b where b.id = t.id`);
  console.log(`백업 ${saved}행(상한 id=${max}) / 백필 ${upd.rowCount}행`);
  const after = await summary('백필 후');
  const ok = before.n === after.n && before.sin === after.sin && before.sout === after.sout && after.ym_mismatch === '0';
  console.log(ok ? '✅ 검증 통과 — 건수·금액 불변, ym 100% 일치' : '❌ 검증 실패 — revert 검토');
} else if (mode === 'revert') {
  const upd = await c.query(`update finance.transactions t set tx_at = b.tx_at from ${BACKUP} b where b.id = t.id`);
  console.log(`원복 ${upd.rowCount}행`);
  await summary('원복 후');
} else {
  console.log('사용법: check | apply | revert');
}
await c.end();
