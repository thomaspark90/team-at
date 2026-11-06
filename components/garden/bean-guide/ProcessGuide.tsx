import { HONEY_LEVELS, PROCESS_GROUPS, PROCESS_RULES } from '@/lib/garden/bean-guide/processes';
import BeanCite from './BeanCite';

const th = 'px-3 py-1.5 text-left text-caption font-normal text-muted-foreground first:pl-0';
const td = 'border-t border-border px-3 py-2 align-top text-body first:pl-0';

export function ProcessTables() {
  return (
    <div className="space-y-10">
      {PROCESS_GROUPS.map((g) => (
        <div key={g.key}>
          <h3 className="m-0 text-body font-medium">{g.label}</h3>
          <p className="m-0 mb-2 mt-0.5 text-caption text-muted-foreground">{g.desc}</p>
          <div className="hidden lg:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${th} w-44`}>가공</th>
                  <th className={th}>만드는 법</th>
                  <th className={`${th} w-52`}>자주 묘사되는 맛</th>
                  <th className={th}>알아둘 점</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((p) => (
                  <tr key={p.name}>
                    <td className={td}>{p.name}</td>
                    <td className={td}>{p.steps.join(' → ')}</td>
                    <td className={td}>{p.flavor}</td>
                    <td className={td}>
                      {p.note}
                      <BeanCite ids={p.src} />
                      {p.menu && <div className="mt-1 text-caption text-muted-foreground">우리 메뉴: {p.menu}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden">
            {g.items.map((p) => (
              <article key={p.name} className="border-t border-border py-3">
                <h4 className="m-0 text-body font-medium">{p.name}</h4>
                <p className="m-0 mt-1 break-words text-body">{p.steps.join(' → ')}</p>
                <p className="m-0 mt-1.5 text-caption text-muted-foreground">자주 묘사되는 맛: {p.flavor}</p>
                <p className="m-0 mt-1.5 break-words text-body text-muted-foreground">
                  {p.note}
                  <BeanCite ids={p.src} />
                </p>
                {p.menu && <p className="m-0 mt-1 text-caption text-muted-foreground">우리 메뉴: {p.menu}</p>}
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HoneyTable() {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={th}>이름</th>
          <th className={`${th} text-right`}>남기는 점액질</th>
          <th className={th}>가까운 쪽</th>
        </tr>
      </thead>
      <tbody>
        {HONEY_LEVELS.map((h) => (
          <tr key={h.name}>
            <td className={td}>{h.name}</td>
            <td className={`${td} text-right tabular`}>{h.mucilage}</td>
            <td className={`${td} text-muted-foreground`}>{h.near || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ProcessRules() {
  return (
    <dl className="m-0 grid gap-x-8 lg:grid-cols-2">
      {PROCESS_RULES.map((r) => (
        <div key={r.title} className="border-t border-border py-2">
          <dt className="text-body font-medium">{r.title}</dt>
          <dd className="m-0 mt-0.5 break-words text-body text-muted-foreground">
            {r.text}
            <BeanCite ids={r.src} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
