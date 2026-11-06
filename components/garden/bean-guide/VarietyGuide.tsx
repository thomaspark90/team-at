import { VARIETIES_SHOWN, VARIETY_GROUPS, type Variety } from '@/lib/garden/bean-guide/varieties';
import BeanCite from './BeanCite';
import { MoreDetails } from './MoreDetails';

const ROW_GRID = 'lg:grid lg:grid-cols-[10rem_minmax(0,1fr)_6rem_6rem_5rem] lg:gap-x-4';

function VarietyRow({ v }: { v: Variety }) {
  const known = v.quality !== '—';
  return (
    <article className={`border-t border-border py-3 ${ROW_GRID}`}>
      <div className="text-body font-medium lg:font-normal">
        {v.name}
        {v.onMenu && <span className="ml-1.5 whitespace-nowrap text-caption text-muted-foreground">우리 메뉴</span>}
      </div>
      <p className="m-0 mt-1 break-words text-body lg:mt-0">
        {v.about}
        <BeanCite ids={v.src} />
      </p>
      {known && (
        <p className="m-0 mt-1 text-caption text-muted-foreground lg:hidden">
          품질 {v.quality} · 수확량 {v.yieldLevel} · 녹병 저항 {v.rust}
        </p>
      )}
      <div className="hidden text-body lg:block">{v.quality}</div>
      <div className="hidden text-body lg:block">{v.yieldLevel}</div>
      <div className="hidden text-body lg:block">{v.rust}</div>
    </article>
  );
}

// 계열별로 먼저 몇 가지만 보여주고 나머지는 펼친다.
export default function VarietyGuide() {
  return (
    <div>
      <div className={`hidden pb-1.5 text-caption text-muted-foreground ${ROW_GRID}`}>
        <span>품종</span>
        <span>어떤 품종인가</span>
        <span>품질 잠재력</span>
        <span>수확량</span>
        <span>녹병 저항</span>
      </div>
      <div className="space-y-8">
        {VARIETY_GROUPS.map(({ group, items }) => {
          const rest = items.slice(VARIETIES_SHOWN);
          return (
            <section key={group}>
              <h3 className="m-0 mb-2 text-body font-medium">{group}</h3>
              {items.slice(0, VARIETIES_SHOWN).map((v) => (
                <VarietyRow key={v.name} v={v} />
              ))}
              {rest.length > 0 && (
                <MoreDetails label={`더 보기 ${rest.length}개`}>
                  {rest.map((v) => (
                    <VarietyRow key={v.name} v={v} />
                  ))}
                </MoreDetails>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
