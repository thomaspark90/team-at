import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import CategoryManager, { type ManagedCat } from '@/components/finance/CategoryManager';
import BrandBankSettings, { type BrandBankRow } from '@/components/finance/BrandBankSettings';

export default async function CategoriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (role !== 'admin') redirect('/finance');

  const data = unwrap(
    await supabase
      .schema('finance')
      .from('categories')
      .select('id,type,name,parent_id,active,pinned,sort,vat_taxable')
      .order('sort', { ascending: true }),
    '계정과목',
  );

  // 브랜드별 사용 은행 — 테이블 미생성(마이그레이션 전)이면 빈 목록으로 두고 컴포넌트가 전체 사용으로 표시
  const { data: bankRows } = await supabase.schema('finance').from('brand_settings').select('brand,banks');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">설정</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 재무로
          </Link>
        </div>

        <div className="flex flex-col gap-10">
          <section>
            <h2 className="mb-2 text-[15px] tracking-[-0.3px] text-foreground">브랜드별 사용 은행</h2>
            <BrandBankSettings initial={(bankRows as BrandBankRow[]) ?? []} />
          </section>

          <section>
            <h2 className="mb-2 text-[15px] tracking-[-0.3px] text-foreground">계정과목</h2>
            <CategoryManager initial={(data as ManagedCat[]) ?? []} />
          </section>
        </div>
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '설정' };
