import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isTeamEmail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function safeNext(next: string | null): string {
  // Solo rutas internas: evita open redirect.
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isTeamEmail(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=domain`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
