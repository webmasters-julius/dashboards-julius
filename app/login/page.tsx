'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const DOMAIN = 'julius2grow.com';

function LoginForm() {
  const params = useSearchParams();
  const urlError = params.get('error');
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(
    urlError === 'domain'
      ? `Solo se permiten cuentas @${DOMAIN}.`
      : urlError === 'link'
        ? 'El link venció o ya se usó. Pide uno nuevo.'
        : null
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const clean = email.trim().toLowerCase();
    if (!clean.endsWith(`@${DOMAIN}`)) {
      setError(`Usa tu correo @${DOMAIN}.`);
      return;
    }

    setStatus('sending');
    const supabase = createClient();
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: clean,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    });

    if (otpError) {
      setStatus('idle');
      setError('No se pudo enviar el link. Verifica el correo e inténtalo de nuevo.');
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="login-wrap">
      <div className="login-card panel">
        <div className="brand" style={{ marginBottom: 16 }}>
          <span className="brand-mark">[</span>
          Dashboards Julius
        </div>

        {status === 'sent' ? (
          <div className="alert alert-ok">
            Te enviamos un link de acceso a <strong>{email}</strong>. Ábrelo en este mismo navegador.
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <p className="page-sub" style={{ marginTop: 0 }}>
              Entra con tu correo de Julius. Te enviaremos un link de acceso, sin contraseña.
            </p>
            <label className="field">
              <span className="field-label">Correo</span>
              <input
                className="input"
                type="email"
                required
                autoFocus
                placeholder={`nombre@${DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <div className="alert alert-error">{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={status === 'sending'}>
              {status === 'sending' ? 'Enviando…' : 'Enviarme el link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
