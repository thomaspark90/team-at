import { ALTITUDE_CHAIN, ALTITUDE_FINDINGS, ALTITUDE_MEASURES, LATITUDE_BANDS, MYTH_CHECKS, QUALITY_FACTORS, REVIEW_COUNTS } from '@/lib/garden/bean-guide/factors';
import BeanCite from './BeanCite';
import { MoreDetails } from './MoreDetails';

// 각 목록에서 먼저 보여줄 개수. 데이터 순서가 곧 우선순위다.
const SHOWN = 4;

const th = 'px-3 py-1.5 text-left text-caption font-normal text-muted-foreground first:pl-0';
const td = 'border-t border-border px-3 py-1.5 align-top text-body first:pl-0';

export function AltitudeChain() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-title">
      {ALTITUDE_CHAIN.map((step, i) => (
        <span key={step} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
          {step}
        </span>
      ))}
    </div>
  );
}

export function AltitudeFindings() {
  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {ALTITUDE_FINDINGS.map((f) => (
        <li key={f.text} className="text-body">
          {f.text}
          <BeanCite ids={f.src} />
        </li>
      ))}
    </ul>
  );
}

export function LatitudeTable() {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={th}>위도</th>
          <th className={`${th} text-right`}>낮음(m)</th>
          <th className={`${th} text-right`}>중간(m)</th>
          <th className={`${th} text-right`}>높음(m)</th>
        </tr>
      </thead>
      <tbody>
        {LATITUDE_BANDS.map((b) => (
          <tr key={b.latitude}>
            <td className={td}>{b.latitude}</td>
            <td className={`${td} text-right tabular`}>{b.low}</td>
            <td className={`${td} text-right tabular`}>{b.medium}</td>
            <td className={`${td} text-right tabular`}>{b.high}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const FACTOR_GRID = 'lg:grid lg:grid-cols-[7rem_minmax(0,1fr)_18rem] lg:gap-x-4';

function FactorRow({ f }: { f: (typeof QUALITY_FACTORS)[number] }) {
  return (
    <article className={`border-t border-border py-3 lg:py-2 ${FACTOR_GRID}`}>
      <h4 className="m-0 text-body font-medium lg:font-normal">{f.name}</h4>
      <p className="m-0 mt-1 break-words text-body lg:mt-0">
        {f.finding}
        <BeanCite ids={f.src} />
      </p>
      <p className="m-0 mt-1 text-caption text-muted-foreground lg:mt-0 lg:text-body">
        <span className="lg:hidden">스탭 설명: </span>
        {f.say}
      </p>
    </article>
  );
}

export function FactorTable() {
  const rest = QUALITY_FACTORS.slice(SHOWN);
  return (
    <>
      <div className={`hidden pb-1.5 text-caption text-muted-foreground ${FACTOR_GRID}`}>
        <span>요소</span>
        <span>확인된 내용</span>
        <span>스탭 설명</span>
      </div>
      {QUALITY_FACTORS.slice(0, SHOWN).map((f) => (
        <FactorRow key={f.name} f={f} />
      ))}
      <MoreDetails label={`더 보기 ${rest.length}개`}>
        {rest.map((f) => (
          <FactorRow key={f.name} f={f} />
        ))}
      </MoreDetails>
    </>
  );
}

function MythList({ items }: { items: typeof MYTH_CHECKS }) {
  return (
    <dl className="m-0 grid gap-x-8 lg:grid-cols-2">
      {items.map((m) => (
        <div key={m.claim} className="border-t border-border py-2">
          <dt className="text-body font-medium">{m.claim}</dt>
          <dd className="m-0 mt-0.5 break-words text-body text-muted-foreground">
            {m.verdict}
            <BeanCite ids={m.src} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MythTable() {
  const rest = MYTH_CHECKS.slice(SHOWN);
  return (
    <>
      <MythList items={MYTH_CHECKS.slice(0, SHOWN)} />
      <MoreDetails label={`더 보기 ${rest.length}개`}>
        <MythList items={rest} />
      </MoreDetails>
    </>
  );
}

const MEASURE_GRID = 'lg:grid lg:grid-cols-[9rem_minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-x-4';

function MeasureRow({ m }: { m: (typeof ALTITUDE_MEASURES)[number] }) {
  return (
    <article className={`border-t border-border py-3 lg:py-2 ${MEASURE_GRID}`}>
      <h4 className="m-0 text-body font-medium lg:font-normal">{m.item}</h4>
      <p className="m-0 mt-1 break-words text-body lg:mt-0">
        {m.result}
        <BeanCite ids={m.src} />
      </p>
      <p className="m-0 mt-1 text-caption text-muted-foreground lg:mt-0 lg:text-body">{m.caution}</p>
    </article>
  );
}

export function AltitudeMeasures() {
  const rest = ALTITUDE_MEASURES.slice(SHOWN);
  return (
    <>
      <div className={`hidden pb-1.5 text-caption text-muted-foreground ${MEASURE_GRID}`}>
        <span>항목</span>
        <span>측정 결과</span>
        <span>주의</span>
      </div>
      {ALTITUDE_MEASURES.slice(0, SHOWN).map((m) => (
        <MeasureRow key={m.item} m={m} />
      ))}
      <MoreDetails label={`더 보기 ${rest.length}개`}>
        {rest.map((m) => (
          <MeasureRow key={m.item} m={m} />
        ))}
      </MoreDetails>
    </>
  );
}

export function ReviewCounts() {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={th}>요인</th>
          <th className={`${th} text-right`}>논문</th>
          <th className={`${th} text-right`}>관능 상승</th>
          <th className={`${th} text-right`}>관능 하락</th>
        </tr>
      </thead>
      <tbody>
        {REVIEW_COUNTS.map((r) => (
          <tr key={r.factor}>
            <td className={td}>{r.factor}</td>
            <td className={`${td} text-right tabular`}>{r.papers}편</td>
            <td className={`${td} text-right tabular`}>{r.up}</td>
            <td className={`${td} text-right tabular`}>{r.down}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
