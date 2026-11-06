'use client';

import { useState } from 'react';
import { ORIGIN_GROUPS } from '@/lib/garden/bean-guide/origins';
import BeanCite from './BeanCite';

const th = 'px-2 py-1.5 text-left text-caption font-normal text-muted-foreground first:pl-0';
const td = 'border-t border-border px-2 py-2 align-top text-caption first:pl-0';

// 대륙별 원산지 표. lg 미만은 산지별 묶음으로 보여준다.
export default function OriginTables() {
  const [key, setKey] = useState(ORIGIN_GROUPS[0].key);
  const group = ORIGIN_GROUPS.find((g) => g.key === key) ?? ORIGIN_GROUPS[0];
  return (
    <>
      <div role="tablist" className="mb-4 flex flex-wrap gap-1">
        {ORIGIN_GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={g.key === key}
            onClick={() => setKey(g.key)}
            className={`rounded-md px-3 py-1.5 text-body ${g.key === key ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent'}`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="hidden lg:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-44`}>산지</th>
              <th className={`${th} w-32`}>고도(m)</th>
              <th className={th}>기후·토양</th>
              <th className={`${th} w-32`}>수확</th>
              <th className={th}>품종</th>
              <th className={th}>가공</th>
              <th className={th}>흔히 묘사되는 풍미</th>
              <th className={`${th} w-24`}>근거</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r) => (
              <tr key={r.name}>
                <td className={`${td} text-body`}>{r.name}</td>
                <td className={`${td} tabular`}>{r.altitude}</td>
                <td className={td}>{r.climate}</td>
                <td className={td}>{r.harvest}</td>
                <td className={td}>{r.variety}</td>
                <td className={td}>{r.process}</td>
                <td className={td}>{r.flavor}</td>
                <td className={`${td} text-muted-foreground`}>
                  {r.grade}
                  <BeanCite ids={r.src} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg:hidden">
        {group.rows.map((r) => (
          <article key={r.name} className="border-t border-border py-3">
            <h3 className="m-0 text-body font-medium">{r.name}</h3>
            <dl className="m-0 mt-1.5 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-caption sm:grid-cols-[4.5rem_1fr_4.5rem_1fr]">
              {[
                ['고도(m)', r.altitude],
                ['기후·토양', r.climate],
                ['수확', r.harvest],
                ['품종', r.variety],
                ['가공', r.process],
                ['풍미', r.flavor],
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="m-0 min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mb-0 mt-1.5 break-words text-caption text-muted-foreground">
              근거 {r.grade}
              <BeanCite ids={r.src} />
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
