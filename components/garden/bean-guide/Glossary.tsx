import { GLOSSARY } from '@/lib/garden/bean-guide/glossary';

export default function Glossary() {
  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-3">
      {GLOSSARY.map((g) => (
        <section key={g.group} className="min-w-0">
          <h3 className="m-0 mb-2 text-body font-medium">{g.group}</h3>
          <dl className="m-0">
            {g.terms.map((t) => (
              <div key={t.term} className="border-t border-border py-2">
                <dt className="text-body">{t.term}</dt>
                <dd className="m-0 mt-0.5 break-words text-caption text-muted-foreground">{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
