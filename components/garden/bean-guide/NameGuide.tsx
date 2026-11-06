import { MENU_NAMES, NAME_ANATOMY, NAME_TERMS, READING_STEPS, type MenuName } from '@/lib/garden/bean-guide/names';
import BeanCite from './BeanCite';

const th = 'px-2 py-1.5 text-left text-caption font-normal text-muted-foreground first:pl-0';
const td = 'border-t border-border px-2 py-1.5 align-top text-caption first:pl-0';

// 괄호 값은 이름에 없고 자료에서 확인한 내용이라 흐리게 보여준다.
const Cell = ({ value }: { value: string }) => (
  <span className={value.startsWith('(') ? 'text-muted-foreground' : ''}>{value || '—'}</span>
);

const FIELDS: { key: keyof MenuName; label: string }[] = [
  { key: 'country', label: '국가' },
  { key: 'region', label: '지역' },
  { key: 'unit', label: '농장·수세장' },
  { key: 'variety', label: '품종' },
  { key: 'process', label: '가공' },
  { key: 'label', label: '등급·라벨' },
];

export function NameAnatomy() {
  return (
    <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
      {NAME_ANATOMY.map((parts) => (
        <div key={parts[0].part + parts[1].part} className="flex flex-wrap gap-x-4 gap-y-3">
          {parts.map((p) => (
            <div key={p.part}>
              <div className="text-title">{p.part}</div>
              <div className="mt-0.5 border-t border-border pt-1 text-caption text-muted-foreground">{p.role}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ReadingSteps() {
  return (
    <ol className="m-0 grid list-none gap-x-6 gap-y-1 p-0 sm:grid-cols-2 lg:grid-cols-4">
      {READING_STEPS.map((s, i) => (
        <li key={s} className="text-body">
          <span className="tabular mr-1.5 text-muted-foreground">{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

export function MenuNameTable() {
  return (
    <>
      <div className="hidden lg:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-72`}>메뉴 이름</th>
              {FIELDS.map((f) => (
                <th key={f.key} className={th}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MENU_NAMES.map((n) => (
              <tr key={n.menu}>
                <td className={`${td} text-body`}>
                  {n.menu}
                  <BeanCite ids={n.src} />
                </td>
                {FIELDS.map((f) => (
                  <td key={f.key} className={td}>
                    <Cell value={String(n[f.key] ?? '')} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg:hidden">
        {MENU_NAMES.map((n) => (
          <article key={n.menu} className="border-t border-border py-3">
            <h4 className="m-0 break-words text-body font-medium">
              {n.menu}
              <BeanCite ids={n.src} />
            </h4>
            <dl className="m-0 mt-1.5 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-caption sm:grid-cols-[4.5rem_1fr_4.5rem_1fr]">
              {FIELDS.filter((f) => n[f.key]).map((f) => (
                <div key={f.key} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="m-0 min-w-0">
                    <Cell value={String(n[f.key])} />
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

export function NameTerms() {
  return (
    <dl className="m-0 grid gap-x-8 lg:grid-cols-2">
      {NAME_TERMS.map((t) => (
        <div key={t.term} className="border-t border-border py-2">
          <dt className="text-body font-medium">{t.term}</dt>
          <dd className="m-0 mt-0.5 break-words text-body text-muted-foreground">
            {t.meaning}
            <BeanCite ids={t.src} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
