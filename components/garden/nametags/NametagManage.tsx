'use client';

import { useCallback, useEffect, useState } from 'react';
import NametagMenuEditor from './NametagMenuEditor';
import NametagPrintQueue from './NametagPrintQueue';
import { API, call, failed, type NametagData } from './shared';

// 네임택 인쇄·메뉴 관리(그래픽 담당) — 위: 프린트 요청함, 아래: 메뉴 목록 편집.
export default function NametagManage() {
  const [data, setData] = useState<NametagData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await call<NametagData>(API);
    if (failed(j)) return setError(j.error);
    setError(null);
    setData(j);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="ta-error text-body">{error}</p>;
  if (!data) return <p className="text-body text-muted-foreground">불러오는 중</p>;
  if (!data.canManage) return <p className="text-body text-muted-foreground">인쇄·메뉴 관리 권한이 없습니다. 운영진에게 요청해 주세요.</p>;

  return (
    <div className="space-y-14">
      <section>
        <h2 className="m-0 mb-4 text-title">프린트 요청</h2>
        <NametagPrintQueue requests={data.requests} onChange={load} />
      </section>
      <section>
        <h2 className="m-0 mb-4 text-title">메뉴 관리</h2>
        <NametagMenuEditor catalog={data.catalog} onCatalog={(catalog) => setData((d) => d && { ...d, catalog })} />
      </section>
    </div>
  );
}
