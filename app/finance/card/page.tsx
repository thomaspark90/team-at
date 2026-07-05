import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import CardReconcile from '@/components/finance/CardReconcile';

export default async function CardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <CardReconcile />
      </div>
    </div>
  );
}
