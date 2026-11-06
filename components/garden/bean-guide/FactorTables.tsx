import { ALTITUDE_CHAIN, ALTITUDE_FINDINGS, ALTITUDE_MEASURES, LATITUDE_BANDS, MYTH_CHECKS, QUALITY_FACTORS, REVIEW_COUNTS } from '@/lib/garden/bean-guide/factors';
import BeanCite from './BeanCite';

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

export function FactorTable() {
  return (
    <>
      <div className="hidden lg:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-28`}>요소</th>
              <th className={th}>확인된 내용</th>
              <th className={`${th} w-72`}>스탭 설명</th>
            </tr>
          </thead>
          <tbody>
            {QUALITY_FACTORS.map((f) => (
              <tr key={f.name}>
                <td className={td}>{f.name}</td>
                <td className={td}>
                  {f.finding}
                  <BeanCite ids={f.src} />
                </td>
                <td className={`${td} text-muted-foreground`}>{f.say}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg:hidden">
        {QUALITY_FACTORS.map((f) => (
          <article key={f.name} className="border-t border-border py-3">
            <h4 className="m-0 text-body font-medium">{f.name}</h4>
            <p className="m-0 mt-1 break-words text-body">
              {f.finding}
              <BeanCite ids={f.src} />
            </p>
            <p className="m-0 mt-1 text-caption text-muted-foreground">스탭 설명: {f.say}</p>
          </article>
        ))}
      </div>
    </>
  );
}

export function MythTable() {
  return (
    <dl className="m-0 grid gap-x-8 lg:grid-cols-2">
      {MYTH_CHECKS.map((m) => (
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

export function AltitudeMeasures() {
  return (
    <>
      <div className="hidden lg:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-36`}>항목</th>
              <th className={th}>측정 결과</th>
              <th className={th}>주의</th>
            </tr>
          </thead>
          <tbody>
            {ALTITUDE_MEASURES.map((m) => (
              <tr key={m.item}>
                <td className={td}>{m.item}</td>
                <td className={td}>
                  {m.result}
                  <BeanCite ids={m.src} />
                </td>
                <td className={`${td} text-muted-foreground`}>{m.caution}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg:hidden">
        {ALTITUDE_MEASURES.map((m) => (
          <article key={m.item} className="border-t border-border py-3">
            <h4 className="m-0 text-body font-medium">{m.item}</h4>
            <p className="m-0 mt-1 break-words text-body">
              {m.result}
              <BeanCite ids={m.src} />
            </p>
            <p className="m-0 mt-1 text-caption text-muted-foreground">{m.caution}</p>
          </article>
        ))}
      </div>
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
