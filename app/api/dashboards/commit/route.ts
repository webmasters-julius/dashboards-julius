import { NextResponse } from 'next/server';
import { getTeamUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidSlug } from '@/lib/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 25 * 1024 * 1024;
const VISIBILITIES = ['team', 'link', 'public'] as const;
type Visibility = (typeof VISIBILITIES)[number];
const PATH_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/(\d{13}-[a-z0-9]{6,12})\.html$/;

/**
 * Paso 2 de la subida. El navegador ya subió el .html directo a Storage;
 * aquí se verifica que existe y se registra la versión del dashboard.
 */
export async function POST(req: Request) {
  try {
    return await commitDashboard(req);
  } catch (error) {
    // Keep implementation details (including configuration errors) in Vercel logs.
    console.error('[dashboard commit] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Error interno al guardar el dashboard. Revisa los logs de Vercel.' },
      { status: 500 }
    );
  }
}

async function commitDashboard(req: Request) {
  const user = await getTeamUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const slug = String(body.slug ?? '').trim();
  const title = String(body.title ?? '').trim();
  const client = String(body.client ?? '').trim();
  const path = String(body.path ?? '');
  const visibility = String(body.visibility ?? 'team') as Visibility;

  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: 'URL inválida: usa minúsculas, números y guiones (2 a 80 caracteres).' },
      { status: 400 }
    );
  }
  if (title.length < 1 || title.length > 160) {
    return NextResponse.json({ error: 'El título es obligatorio (máx. 160 caracteres).' }, { status: 400 });
  }
  if (client.length > 120) {
    return NextResponse.json({ error: 'El cliente es demasiado largo (máx. 120).' }, { status: 400 });
  }
  if (!VISIBILITIES.includes(visibility)) {
    return NextResponse.json({ error: 'Visibilidad inválida.' }, { status: 400 });
  }

  const match = PATH_RE.exec(path);
  if (!match || match[1] !== slug) {
    return NextResponse.json({ error: 'Ruta de archivo inválida.' }, { status: 400 });
  }
  const fileName = `${match[2]}.html`;

  const admin = createAdminClient();
  const bucket = admin.storage.from('dashboards');

  const { data: files, error: listError } = await bucket.list(slug, { search: fileName, limit: 5 });
  if (listError) {
    console.error('[dashboard commit] Storage list failed:', listError);
    return NextResponse.json({ error: 'No se pudo verificar el archivo.' }, { status: 500 });
  }
  const file = files?.find((f) => f.name === fileName);
  if (!file) {
    return NextResponse.json({ error: 'El archivo no aparece en el almacenamiento.' }, { status: 400 });
  }

  const size = Number((file.metadata as { size?: number } | null)?.size ?? 0);
  if (size > MAX_BYTES) {
    await bucket.remove([path]);
    return NextResponse.json({ error: 'El archivo supera 25 MB.' }, { status: 413 });
  }

  const email = user.email as string;

  const { data: existing, error: findError } = await admin
    .from('dashboards')
    .select('id, version')
    .eq('slug', slug)
    .maybeSingle();
  if (findError) {
    console.error('[dashboard commit] Dashboard lookup failed:', findError);
    return NextResponse.json({ error: 'Error al consultar el dashboard.' }, { status: 500 });
  }

  if (existing) {
    const nextVersion = existing.version + 1;

    // La restricción unique (dashboard_id, version) evita carreras entre dos subidas simultáneas.
    const { error: versionError } = await admin.from('dashboard_versions').insert({
      dashboard_id: existing.id,
      version: nextVersion,
      storage_path: path,
      size_bytes: size,
      uploaded_by_email: email,
    });
    if (versionError) {
      console.error('[dashboard commit] Version insert failed:', versionError);
      return NextResponse.json(
        { error: 'Otra subida se registró al mismo tiempo. Intenta de nuevo.' },
        { status: 409 }
      );
    }

    const { error: updateError } = await admin
      .from('dashboards')
      .update({
        title,
        client,
        visibility,
        current_path: path,
        version: nextVersion,
        size_bytes: size,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (updateError) {
      console.error('[dashboard commit] Dashboard update failed:', updateError);
      return NextResponse.json({ error: 'No se pudo actualizar el dashboard.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, slug, version: nextVersion, created: false });
  }

  const { data: created, error: insertError } = await admin
    .from('dashboards')
    .insert({
      slug,
      title,
      client,
      visibility,
      current_path: path,
      version: 1,
      size_bytes: size,
      created_by: user.id,
      created_by_email: email,
    })
    .select('id')
    .single();

  if (insertError || !created) {
    if (insertError) console.error('[dashboard commit] Dashboard insert failed:', insertError);
    const duplicate = insertError?.code === '23505';
    return NextResponse.json(
      { error: duplicate ? 'Esa URL ya existe. Intenta de nuevo.' : 'No se pudo crear el dashboard.' },
      { status: duplicate ? 409 : 500 }
    );
  }

  const { error: initialVersionError } = await admin.from('dashboard_versions').insert({
    dashboard_id: created.id,
    version: 1,
    storage_path: path,
    size_bytes: size,
    uploaded_by_email: email,
  });

  if (initialVersionError) {
    console.error('[dashboard commit] Initial version insert failed:', initialVersionError);
    // Remove the just-created row so a retry won't get stuck on the unique slug.
    await admin.from('dashboards').delete().eq('id', created.id);
    return NextResponse.json({ error: 'No se pudo registrar la versión del dashboard.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, slug, version: 1, created: true });
}
