import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTeamUser, isAdminEmail } from '@/lib/auth';
import Header from '@/components/Header';
import DashboardCard, { type DashboardRow } from '@/components/DashboardCard';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; client?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const user = await getTeamUser();
  if (!user) redirect('/login?error=domain');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('dashboards')
    .select('id, slug, title, client, visibility, version, size_bytes, created_by, created_by_email, updated_at')
    .order('updated_at', { ascending: false });

  const all = (data ?? []) as DashboardRow[];
  const q = (resolvedSearchParams.q ?? '').trim().toLowerCase();
  const clientFilter = (resolvedSearchParams.client ?? '').trim();

  const clients = Array.from(new Set(all.map((d) => d.client).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'es')
  );

  const filtered = all.filter((d) => {
    if (clientFilter && d.client !== clientFilter) return false;
    if (q && !`${d.title} ${d.slug} ${d.client}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // Agrupar por cliente (sin cliente al final)
  const groups = new Map<string, DashboardRow[]>();
  for (const d of filtered) {
    const key = d.client || 'Sin cliente';
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === 'Sin cliente') return 1;
    if (b === 'Sin cliente') return -1;
    return a.localeCompare(b, 'es');
  });

  const admin = isAdminEmail(user.email);

  return (
    <div className="container">
      <Header email={user.email as string} />

      <h1 className="page-title">Dashboards</h1>
      <p className="page-sub">
        {all.length === 0
          ? 'Aún no hay dashboards publicados.'
          : `${all.length} dashboard${all.length === 1 ? '' : 's'} publicado${all.length === 1 ? '' : 's'}.`}
      </p>

      {error && <div className="alert alert-error">No se pudo cargar el listado. Recarga la página.</div>}

      <div className="toolbar">
        <form method="get">
          {clientFilter && <input type="hidden" name="client" value={clientFilter} />}
          <input
            className="input"
            type="search"
            name="q"
            defaultValue={resolvedSearchParams.q ?? ''}
            placeholder="Buscar por nombre, URL o cliente…"
          />
        </form>
      </div>

      {clients.length > 0 && (
        <div className="chips">
          <Link href={q ? `/?q=${encodeURIComponent(q)}` : '/'} className={`chip ${!clientFilter ? 'active' : ''}`}>
            Todos
          </Link>
          {clients.map((c) => {
            const qs = new URLSearchParams();
            qs.set('client', c);
            if (q) qs.set('q', q);
            return (
              <Link key={c} href={`/?${qs.toString()}`} className={`chip ${clientFilter === c ? 'active' : ''}`}>
                {c}
              </Link>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty panel">
          {all.length === 0 ? (
            <>
              <p>Sube el primer dashboard para verlo aquí.</p>
              <Link href="/upload" className="btn btn-primary">
                Subir dashboard
              </Link>
            </>
          ) : (
            <p>Ningún dashboard coincide con la búsqueda.</p>
          )}
        </div>
      ) : (
        groupKeys.map((key) => (
          <section key={key}>
            <div className="group-title">{key}</div>
            <div className="grid">
              {groups.get(key)!.map((d) => (
                <DashboardCard
                  key={d.id}
                  dashboard={d}
                  canDelete={admin || d.created_by === user.id}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
