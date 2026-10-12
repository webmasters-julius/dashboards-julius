import { NextResponse } from 'next/server';
import { getTeamUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateToken, hashToken } from '@/lib/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: { id: string } };

/** Lista los links de cliente de un dashboard (sin tokens: solo se guardan hasheados). */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getTeamUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('share_links')
    .select('id, label, expires_at, revoked_at, created_at, created_by_email')
    .eq('dashboard_id', params.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'No se pudieron leer los links' }, { status: 500 });
  return NextResponse.json({ links: data ?? [] });
}

/** Crea un link de cliente. Devuelve la URL completa una sola vez. */
export async function POST(req: Request, { params }: Ctx) {
  const user = await getTeamUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // cuerpo vacío permitido
  }

  const label = String(body.label ?? '').trim().slice(0, 80);
  // Accept hours for the UI's short durations, while retaining compatibility
  // with clients that still send expiresInDays.
  const rawHours = body.expiresInHours;
  const rawDays = body.expiresInDays;
  let expiresAt: string | null = null;
  if (rawHours !== null && rawHours !== undefined) {
    const hours = Number(rawHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 365 * 24) {
      return NextResponse.json({ error: 'La caducidad debe ser de 1 hora a 365 días.' }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();
  } else if (rawDays !== null && rawDays !== undefined) {
    const days = Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: 'La caducidad debe ser de 1 a 365 días.' }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  }

  const admin = createAdminClient();
  const { data: dashboard } = await admin
    .from('dashboards')
    .select('id, slug, visibility')
    .eq('id', params.id)
    .maybeSingle();
  if (!dashboard) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const token = generateToken();
  const { error } = await admin.from('share_links').insert({
    dashboard_id: dashboard.id,
    token_hash: hashToken(token),
    label,
    expires_at: expiresAt,
    created_by_email: user.email as string,
  });
  if (error) return NextResponse.json({ error: 'No se pudo crear el link' }, { status: 500 });

  // Los links solo funcionan si el dashboard está en "link" (o "public").
  let visibilityChanged = false;
  if (dashboard.visibility === 'team') {
    await admin.from('dashboards').update({ visibility: 'link' }).eq('id', dashboard.id);
    visibilityChanged = true;
  }

  const { origin } = new URL(req.url);
  return NextResponse.json({
    ok: true,
    url: `${origin}/d/${dashboard.slug}?t=${token}`,
    expiresAt,
    visibilityChanged,
  });
}

/** Revoca un link: DELETE ?linkId=<uuid> */
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getTeamUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const linkId = new URL(req.url).searchParams.get('linkId') ?? '';
  if (!UUID_RE.test(linkId)) return NextResponse.json({ error: 'linkId inválido' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId)
    .eq('dashboard_id', params.id)
    .is('revoked_at', null);

  if (error) return NextResponse.json({ error: 'No se pudo revocar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
