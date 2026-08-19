import { createClient, getSessionUser } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolveRole } from '@/lib/finance/access';
import { deriveColumns, fetchRawBatches, fetchRawRows, isRawSource, payloadCells } from '@/lib/finance/rawQuery';
import { parseRawQuery } from '@/lib/finance/rawParams';

export const runtime = 'nodejs';
export const maxDuration = 60;

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// 로우데이터 CSV 내보내기 — 앱 계산을 앱 밖(엑셀)에서 독립적으로 검산하기 위한 통로.
// 화면에서 보고 있는 조건(출처·기간·정렬·필터)을 그대로 내려받는다.
export async function GET(req: Request) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '조회 권한이 없습니다.' }, { status: 403 });
  }

  const url = new URL(req.url);
  if (!isRawSource(url.searchParams.get('source'))) {
    return NextResponse.json({ error: '출처가 올바르지 않습니다.' }, { status: 400 });
  }
  const query = parseRawQuery(url.searchParams);

  try {
    const batches = await fetchRawBatches(supabase, {
      source: query.source,
      brand: query.brand,
      from: query.from,
      to: query.to,
    });

    // 전 행을 페이지 단위로 끌어온다(내보내기는 화면과 달리 끝까지)
    const all = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await fetchRawRows(supabase, query, { offset, limit: 1000 });
      all.push(...page);
      if (page.length < 1000 || all.length >= 50000) break;
    }

    const columns = deriveColumns(batches, all.slice(0, 50));
    const head = ['배치', '행번호', '행날짜', ...columns, '거래ID', '분류ID'];
    const lines = [head.map(csvCell).join(',')];
    for (const r of all) {
      lines.push(
        [
          String(r.batch_id),
          String(r.row_index),
          r.row_date ?? '',
          ...payloadCells(r.payload, columns),
          r.tx ? String(r.tx.id) : '',
          r.tx?.category_id != null ? String(r.tx.category_id) : '',
        ]
          .map(csvCell)
          .join(',')
      );
    }

    const span = query.from && query.to ? `-${query.from}_${query.to}` : '';
    const name = `raw-${query.source}${query.brand ? `-${query.brand}` : ''}${span}.csv`;
    // 엑셀이 UTF-8 로 열도록 BOM 을 붙인다(한글 깨짐 방지)
    return new NextResponse('﻿' + lines.join('\n'), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
