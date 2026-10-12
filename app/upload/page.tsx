import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTeamUser } from '@/lib/auth';
import Header from '@/components/Header';
import UploadForm, { type ExistingDashboard } from '@/components/UploadForm';

export const dynamic = 'force-dynamic';

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const user = await getTeamUser();
  if (!user) redirect('/login?error=domain');

  const supabase = await createClient();
  const { data } = await supabase
    .from('dashboards')
    .select('slug, title, client, visibility, version');

  const existing = (data ?? []) as ExistingDashboard[];
  const prefill = resolvedSearchParams.slug
    ? existing.find((d) => d.slug === resolvedSearchParams.slug) ?? null
    : null;

  return (
    <div className="container">
      <Header email={user.email as string} />
      <h1 className="page-title">{prefill ? 'Subir nueva versión' : 'Subir dashboard'}</h1>
      <p className="page-sub">
        {prefill
          ? `Reemplaza el contenido de /d/${prefill.slug}. El link seguirá siendo el mismo.`
          : 'Sube el archivo .html que generó Claude. Se publica al instante y obtienes un link.'}
      </p>
      <UploadForm existing={existing} prefill={prefill} />
    </div>
  );
}
