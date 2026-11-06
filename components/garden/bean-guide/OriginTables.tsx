'use client';

import { useState } from 'react';
import { COUNTRY_SUMMARIES, regionLabel, rowsForCountry, type CountrySummary } from '@/lib/garden/bean-guide/countries';
import { ORIGIN_GROUPS, type OriginRow } from '@/lib/garden/bean-guide/origins';
import BeanCite from './BeanCite';

const ROW_GRID = 'md:grid md:grid-cols-[10rem_11rem_minmax(0,1fr)_minmax(0,1.3fr)_1rem] md:gap-x-4';

function RegionDetail({ country, row }: { country: CountrySummary; row: OriginRow }) {
  const label = regionLabel(country, row);
  return (
    <article className="min-w-0">
      {label && <h4 className="m-0 mb-1.5 text-body font-medium">{label}</h4>}
      <dl className="m-0 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-caption">
        {[
          ['고도(m)', row.altitude],
          ['기후·토양', row.climate],
          ['수확', row.harvest],
          ['품종', row.variety],
          ['가공', row.process],
          ['풍미', row.flavor],
        ].map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="m-0 min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-0 mt-1.5 break-words text-caption text-muted-foreground">
        근거 {row.grade}
        <BeanCite ids={row.src} />
      </p>
    </article>
  );
}

function CountryRow({ groupKey, country }: { groupKey: string; country: CountrySummary }) {
  const rows = rowsForCountry(groupKey, country);
  return (
    <details className="group border-t border-border">
      <summary className={`relative cursor-pointer list-none py-3 pr-6 hover:bg-accent/40 md:pr-0 [&::-webkit-details-marker]:hidden ${ROW_GRID}`}>
        <span className="block text-body font-medium">{country.country}</span>
        <span className="tabular mt-1 block text-body md:mt-0">
          <span className="text-caption text-muted-foreground md:hidden">고도(m) </span>
          {country.altitude}
        </span>
        <span className="mt-0.5 block text-body md:mt-0">
          <span className="text-caption text-muted-foreground md:hidden">가공 </span>
          {country.process}
        </span>
        <span className="mt-0.5 block text-body md:mt-0">
          <span className="text-caption text-muted-foreground md:hidden">풍미 </span>
          {country.flavor}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="absolute right-0 top-4 text-muted-foreground transition-transform group-open:rotate-180 md:static md:mt-1.5">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </summary>
      <div className="grid gap-x-10 gap-y-6 pb-6 pt-2 lg:grid-cols-2">
        {rows.map((r) => (
          <RegionDetail key={r.name} country={country} row={r} />
        ))}
      </div>
    </details>
  );
}

// 대륙 탭 → 국가 요약 → 지역 상세. 처음에는 국가 요약만 보인다.
export default function OriginTables() {
  const [key, setKey] = useState(ORIGIN_GROUPS[0].key);
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
      <div className={`hidden pb-1.5 text-caption text-muted-foreground ${ROW_GRID}`}>
        <span>국가</span>
        <span>고도(m)</span>
        <span>주요 가공</span>
        <span>자주 묘사되는 풍미</span>
        <span />
      </div>
      <div key={key} className="border-b border-border">
        {(COUNTRY_SUMMARIES[key] ?? []).map((c) => (
          <CountryRow key={c.country} groupKey={key} country={c} />
        ))}
      </div>
    </>
  );
}
