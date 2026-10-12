'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ShareDialog from '@/components/ShareDialog';

export type DashboardRow = {
  id: string;
  slug: string;
  title: string;
  client: string;
  visibility: 'team' | 'link' | 'public';
  version: number;
  size_bytes: number;
  created_by: string | null;
  created_by_email: string;
  updated_at: string;
};

const VISIBILITY_LABEL: Record<DashboardRow['visibility'], string> = {
  team: 'Solo equipo',
  link: 'Con link de cliente',
  public: 'Público',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DashboardCard({
  dashboard,
  canDelete,
}: {
  dashboard: DashboardRow;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState(dashboard.visibility);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisibility(dashboard.visibility);
  }, [dashboard.visibility]);

  async function copyTeamLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/d/${dashboard.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('No se pudo copiar. Cópialo manualmente desde la barra del navegador.');
    }
  }

  async function changeVisibility(nextVisibility: DashboardRow['visibility']) {
    const previousVisibility = visibility;
    setVisibility(nextVisibility);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: nextVisibility }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setVisibility(previousVisibility);
        setError(body.error ?? 'No se pudo cambiar la visibilidad.');
        return;
      }
      router.refresh();
    } catch {
      setVisibility(previousVisibility);
      setError('No se pudo cambiar la visibilidad. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = window.confirm(
      `¿Borrar "${dashboard.title}" y todas sus versiones? Los links dejarán de funcionar y no se puede deshacer.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/dashboards/${dashboard.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo borrar.');
      return;
    }
    router.refresh();
  }

  return (
    <article className="card">
      <div>
        <h3>{dashboard.title}</h3>
        <div className="card-meta">
          /d/{dashboard.slug} · v{dashboard.version} · {formatSize(dashboard.size_bytes)}
        </div>
      </div>

      <div className="card-meta">
        Actualizado {formatDate(dashboard.updated_at)} por {dashboard.created_by_email.split('@')[0]}
      </div>

      <label>
        <span className="field-label" style={{ marginBottom: 4 }}>
          Visibilidad
        </span>
        <select
          className="select"
          value={visibility}
          disabled={busy}
          onChange={(e) => changeVisibility(e.target.value as DashboardRow['visibility'])}
        >
          {(Object.keys(VISIBILITY_LABEL) as DashboardRow['visibility'][]).map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABEL[v]}
            </option>
          ))}
        </select>
      </label>

      {error && <div className="alert alert-error" style={{ margin: 0 }}>{error}</div>}

      <div className="card-actions">
        <a className="btn btn-primary btn-sm" href={`/d/${dashboard.slug}`} target="_blank" rel="noreferrer">
          Abrir
        </a>
        <button className="btn btn-sm" onClick={copyTeamLink}>
          {copied ? '¡Copiado!' : 'Copiar link'}
        </button>
        <button className="btn btn-sm" onClick={() => setShareOpen(true)}>
          Link de cliente
        </button>
        <Link className="btn btn-sm" href={`/upload?slug=${encodeURIComponent(dashboard.slug)}`}>
          Nueva versión
        </Link>
        {canDelete && (
          <button className="btn btn-sm btn-danger" onClick={remove} disabled={busy}>
            Borrar
          </button>
        )}
      </div>

      {shareOpen && (
        <ShareDialog
          dashboardId={dashboard.id}
          title={dashboard.title}
          visibility={dashboard.visibility}
          onClose={() => setShareOpen(false)}
          onChanged={() => router.refresh()}
        />
      )}
    </article>
  );
}
