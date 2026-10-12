import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'julius2grow.com').toLowerCase();

export function isTeamEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

/** Correos con permiso para borrar cualquier dashboard (ADMIN_EMAILS="a@x.com,b@x.com"). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

/** Devuelve el usuario autenticado solo si es del dominio del equipo; si no, null. */
export async function getTeamUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isTeamEmail(user.email)) return null;
  return user;
}
