import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTeamEmail } from '@/lib/auth';
import { hashToken } from '@/lib/tokens';
import { isValidSlug } from '@/lib/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sirve el HTML de un dashboard.
 *
 * Acceso:
 *  - visibility = public → cualquiera.
 *  - sesión del equipo (@julius2grow.com) → siempre.
 *  - visibility = link  → con ?t=<token> válido, no revocado y no caducado.
 *
 * Seguridad: el HTML es código arbitrario. Se sirve con CSP `sandbox` SIN
 * allow-same-origin, así que el documento corre en un origen opaco y no puede
 * leer cookies, sesión ni almacenamiento de esta app.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) return notFound();

  const admin = createAdminClient();
  const { data: dashboard } = await admin
    .from('dashboards')
    .select('id, slug, visibility, current_path')
    .eq('slug', slug)
    .maybeSingle();
  if (!dashboard) return notFound();

  const url = new URL(request.url);
  const token = url.searchParams.get('t');

  let allowed = dashboard.visibility === 'public';

  if (!allowed) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && isTeamEmail(user.email)) allowed = true;
  }

  if (!allowed && dashboard.visibility === 'link' && token) {
    const { data: link } = await admin
      .from('share_links')
      .select('id, expires_at, revoked_at')
      .eq('dashboard_id', dashboard.id)
      .eq('token_hash', hashToken(token))
      .maybeSingle();

    const valid =
      !!link &&
      !link.revoked_at &&
      (!link.expires_at || new Date(link.expires_at).getTime() > Date.now());
    if (valid) allowed = true;
    else return notFound(); // token inválido: no revelar si el dashboard existe
  }

  if (!allowed) {
    // Sin token ni sesión: mandar a login para el equipo.
    const login = new URL('/login', url.origin);
    login.searchParams.set('next', `/d/${slug}`);
    return NextResponse.redirect(login);
  }

  const { data: file, error } = await admin.storage.from('dashboards').download(dashboard.current_path);
  if (error || !file) return notFound();

  // Streaming: evita el límite de 4.5 MB de respuesta no-stream en funciones de Vercel.
  return new Response(file.stream(), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        'sandbox allow-scripts allow-popups allow-downloads',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      // Never leave a public response in a shared cache after visibility is lowered.
      'Cache-Control': 'private, no-store',
    },
  });
}

function notFound() {
  return new Response('Dashboard no encontrado', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' },
  });
}
