'use client';

import { useCallback, useEffect, useState } from 'react';

type LinkRow = {
  id: string;
  label: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by_email: string;
};

function statusOf(l: LinkRow): { text: string; active: boolean } {
  if (l.revoked_at) return { text: 'Revocado', active: false };
  if (l.expires_at && new Date(l.expires_at).getTime() <= Date.now()) {
    return { text: 'Vencido', active: false };
  }
  if (l.expires_at) {
    return {
      text: `Vence ${new Date(l.expires_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      active: true,
    };
  }
  return { text: 'No vence', active: true };
}

export default function ShareDialog({
  dashboardId,
  title,
  visibility,
  onClose,
  onChanged,
}: {
  dashboardId: string;
  title: string;
  visibility: 'team' | 'link' | 'public';
  onClose: () => void;
  onChanged: () => void;
}) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState('720');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; visibilityChanged: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboards/${dashboardId}/share`);
    if (!res.ok) {
      setError('No se pudieron cargar los links.');
      return;
    }
    const body = await res.json();
    setLinks(body.links ?? []);
  }, [dashboardId]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    setCreated(null);
    const res = await fetch(`/api/dashboards/${dashboardId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        expiresInHours: duration === 'never' ? null : Number(duration),
      }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? 'No se pudo crear el link.');
      return;
    }
    setCreated({ url: body.url, visibilityChanged: !!body.visibilityChanged });
    setLabel('');
    load();
    onChanged();
  }

  async function revoke(linkId: string) {
    if (!window.confirm('¿Revocar este link? Quien lo tenga dejará de poder entrar.')) return;
    setBusy(true);
    const res = await fetch(`/api/dashboards/${dashboardId}/share?linkId=${linkId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      setError('No se pudo revocar el link.');
      return;
    }
    load();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
    }
  }

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2>Link de cliente</h2>
            <p className="page-sub" style={{ margin: '0 0 16px' }}>
              {title}
            </p>
          </div>
          <button className="btn btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {visibility === 'public' && (
          <div className="alert alert-warn">
            Este dashboard es público: cualquiera con la URL normal ya puede verlo, no necesita link.
          </div>
        )}

        <label className="field">
          <span className="field-label">Para quién es (opcional)</span>
          <input
            className="input"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej. Dirección de Kaloní"
          />
        </label>

        <label className="field">
          <span className="field-label">Caducidad</span>
          <select className="select" value={duration} onChange={(e) => setDuration(e.target.value)}>
            <option value="6">6 horas</option>
            <option value="24">1 día</option>
            <option value="168">7 días</option>
            <option value="720">30 días</option>
            <option value="2160">90 días</option>
            <option value="8760">1 año</option>
            <option value="never">No caduca</option>
          </select>
        </label>

        <button className="btn btn-primary" onClick={create} disabled={busy}>
          {busy ? 'Creando…' : 'Crear link'}
        </button>

        {error && <div className="alert alert-error">{error}</div>}

        {created && (
          <div className="alert alert-ok">
            <strong>Copia el link ahora: no se vuelve a mostrar.</strong>
            <div className="row" style={{ marginTop: 8 }}>
              <input className="input" readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn btn-sm" onClick={() => copy(created.url)}>
                {copied ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
            {created.visibilityChanged && (
              <div style={{ marginTop: 8 }}>
                La visibilidad cambió de &quot;Solo equipo&quot; a &quot;Con link de cliente&quot; para que el link funcione.
              </div>
            )}
          </div>
        )}

        {links.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <span className="field-label">Links creados</span>
            {links.map((l) => {
              const s = statusOf(l);
              return (
                <div className="link-item" key={l.id}>
                  <div>
                    <strong>{l.label || 'Sin etiqueta'}</strong>
                    <small>
                      {s.text} · creado por {l.created_by_email.split('@')[0]}
                    </small>
                  </div>
                  {s.active && (
                    <button className="btn btn-sm btn-danger" onClick={() => revoke(l.id)} disabled={busy}>
                      Revocar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
