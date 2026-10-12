import { NextResponse } from 'next/server';
import { getTeamUser, isAdminEmail } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VISIBILITIES = ['team', 'link', 'public'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: { id: string } };

/** Editar metadatos: título, cliente o visibilidad. */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getTeamUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const patch: Record<string, string> = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (title.length < 1 || title.length > 160) {
      return NextResponse.json({ error: 'Título inválido' }, { status: 400 });
    }
    patch.title = title;
  }
  if (body.client !== undefined) {
    const client = String(body.client).trim();
    if (client.length > 120) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });
    patch.client = client;
  }
  if (body.visibility !== undefined) {
    const visibility = String(body.visibility);
    if (!VISIBILITIES.includes(visibility)) {
      return NextResponse.json({ error: 'Visibilidad inválida' }, { status: 400 });
    }
    patch.visibility = visibility;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('dashboards')
    .update(patch)
    .eq('id', params.id)
    .select('id, slug, title, client, visibility')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true, dashboard: data });
}

/** Borrar un dashboard con todas sus versiones. Solo su creador o un admin. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getTeamUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const admin = createAdminClient();

  const { data: dashboard } = await admin
    .from('dashboards')
    .select('id, created_by')
    .eq('id', params.id)
    .maybeSingle();
  if (!dashboard) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const isOwner = dashboard.created_by === user.id;
  if (!isOwner && !isAdminEmail(user.email)) {
    return NextResponse.json(
      { error: 'Solo quien lo creó o un administrador puede borrarlo.' },
      { status: 403 }
    );
  }

  const { data: versions } = await admin
    .from('dashboard_versions')
    .select('storage_path')
    .eq('dashboard_id', params.id);

  const paths = (versions ?? []).map((v) => v.storage_path as string);
  if (paths.length > 0) {
    await admin.storage.from('dashboards').remove(paths);
  }

  const { error } = await admin.from('dashboards').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'No se pudo borrar' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
