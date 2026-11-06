import { FARMS_BY_COUNTRY, FARMS_SHOWN, type Farm } from '@/lib/garden/bean-guide/farms';
import BeanCite from './BeanCite';

const ROW_GRID = 'lg:grid lg:grid-cols-[15rem_11rem_10rem_minmax(0,1fr)] lg:gap-x-4';

function FarmRow({ farm }: { farm: Farm }) {
  return (
    <article className={`border-t border-border py-3 ${ROW_GRID}`}>
      <div className="text-body font-medium lg:font-normal">
        {farm.name}
        {farm.onMenu && <span className="ml-1.5 whitespace-nowrap text-caption text-muted-foreground">우리 메뉴</span>}
      </div>
      <div className="mt-0.5 text-caption text-muted-foreground lg:mt-0 lg:text-body lg:text-foreground">
        {farm.place}
        <span className="lg:hidden"> · {farm.altitude === '—' ? '고도 미확인' : `${farm.altitude} m`}</span>
      </div>
      <div className="tabular hidden text-body lg:block">{farm.altitude}</div>
      <p className="m-0 mt-1.5 break-words text-body lg:mt-0">
        {farm.note}
        <BeanCite ids={farm.src} />
      </p>
    </article>
  );
}

// 국가별로 FARMS_SHOWN 곳까지 먼저 보여주고 나머지는 펼쳐서 본다.
export default function FarmList() {
  return (
    <div>
      <div className={`hidden pb-1.5 text-caption text-muted-foreground ${ROW_GRID}`}>
        <span>농장</span>
        <span>위치</span>
        <span>고도(m)</span>
        <span>왜 유명한가</span>
      </div>
      <div className="space-y-8">
        {FARMS_BY_COUNTRY.map(({ country, farms }) => {
          const rest = farms.slice(FARMS_SHOWN);
          return (
            <section key={country}>
              <h3 className="m-0 mb-2 text-body font-medium">{country}</h3>
              {farms.slice(0, FARMS_SHOWN).map((f) => (
                <FarmRow key={f.name} farm={f} />
              ))}
              {rest.length > 0 && (
                <details className="group">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 py-2 text-caption text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">더 보기 {rest.length}곳</span>
                    <span className="hidden group-open:inline">접기</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="transition-transform group-open:rotate-180">
                      <path d="M2.5 4.5 6 8l3.5-3.5" />
                    </svg>
                  </summary>
                  {rest.map((f) => (
                    <FarmRow key={f.name} farm={f} />
                  ))}
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
