import { BOP_RECORDS, FARMS } from '@/lib/garden/bean-guide/farms';
import BeanCite from './BeanCite';

const th = 'px-3 py-1.5 text-left text-caption font-normal text-muted-foreground first:pl-0';
const td = 'border-t border-border px-3 py-1.5 align-top text-body first:pl-0';

export function FarmTable() {
  const groups = [
    { label: '우리 메뉴와 이어지는 농장', rows: FARMS.filter((f) => f.onMenu) },
    { label: '세계적으로 알려진 농장', rows: FARMS.filter((f) => !f.onMenu) },
  ];
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <div key={g.label}>
          <h3 className="m-0 mb-2 text-body font-medium">{g.label}</h3>
          <div className="hidden lg:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${th} w-56`}>농장</th>
                  <th className={`${th} w-56`}>위치</th>
                  <th className={`${th} w-44`}>고도(m)</th>
                  <th className={th}>왜 유명한가</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((f) => (
                  <tr key={f.name}>
                    <td className={td}>{f.name}</td>
                    <td className={td}>{f.place}</td>
                    <td className={`${td} tabular`}>{f.altitude}</td>
                    <td className={td}>
                      {f.note}
                      <BeanCite ids={f.src} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden">
            {g.rows.map((f) => (
              <article key={f.name} className="border-t border-border py-3">
                <h4 className="m-0 text-body font-medium">{f.name}</h4>
                <p className="m-0 mt-0.5 text-caption text-muted-foreground">
                  {f.place} · {f.altitude === '—' ? '고도 미확인' : `${f.altitude} m`}
                </p>
                <p className="m-0 mt-1.5 break-words text-body">
                  {f.note}
                  <BeanCite ids={f.src} />
                </p>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BopTable() {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={`${th} w-16`}>연도</th>
          <th className={th}>농장</th>
          <th className={`${th} text-right`}>최고가(USD/kg)</th>
          <th className={`${th} hidden text-right sm:table-cell`}>원표기</th>
        </tr>
      </thead>
      <tbody>
        {BOP_RECORDS.map((r) => (
          <tr key={r.year}>
            <td className={`${td} tabular`}>{r.year}</td>
            <td className={td}>
              {r.farm}
              <BeanCite ids={[r.src]} />
            </td>
            <td className={`${td} text-right tabular`}>{r.original.includes('/lb') ? '약 ' : ''}{r.usdPerKg.toLocaleString('en-US')}</td>
            <td className={`${td} hidden text-right tabular text-muted-foreground sm:table-cell`}>{r.original}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
