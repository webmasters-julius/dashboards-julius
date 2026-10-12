'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { slugify, isValidSlug } from '@/lib/slug';

export type ExistingDashboard = {
  slug: string;
  title: string;
  client: string;
  visibility: 'team' | 'link' | 'public';
  version: number;
};

const MAX_BYTES = 25 * 1024 * 1024;

function randomSuffix(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

function prettyName(fileName: string): string {
  return fileName
    .replace(/\.html?$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function UploadForm({
  existing,
  prefill,
}: {
  existing: ExistingDashboard[];
  prefill: ExistingDashboard | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [slug, setSlug] = useState(prefill?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!prefill);
  const [client, setClient] = useState(prefill?.client ?? '');
  const [visibility, setVisibility] = useState<'team' | 'link' | 'public'>(prefill?.visibility ?? 'team');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; version: number; created: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const clients = useMemo(
    () => Array.from(new Set(existing.map((d) => d.client).filter(Boolean))).sort(),
    [existing]
  );
  const existingForSlug = existing.find((d) => d.slug === slug) ?? null;

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return;
    if (!/\.html?$/i.test(f.name)) {
      setError('El archivo debe ser .html');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('El archivo supera 25 MB.');
      return;
    }
    if (f.size === 0) {
      setError('El archivo está vacío.');
      return;
    }
    setFile(f);
    if (!title) {
      const t = prettyName(f.name);
      setTitle(t);
      if (!slugTouched) setSlug(slugify(t));
    }
  }

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) return setError('Selecciona un archivo .html.');
    if (!title.trim()) return setError('Ponle un título.');
    if (!isValidSlug(slug)) {
      return setError('La URL solo puede tener minúsculas, números y guiones (mínimo 2 caracteres).');
    }

    setStatus('uploading');
    const supabase = createClient();
    const path = `${slug}/${Date.now()}-${randomSuffix()}.html`;

    // 1) Subida directa a Storage (no pasa por la función de Vercel → sin límite de 4.5 MB)
    const { error: uploadError } = await supabase.storage.from('dashboards').upload(path, file, {
      contentType: 'text/html',
      upsert: false,
    });
    if (uploadError) {
      setStatus('idle');
      setError(`No se pudo subir el archivo: ${uploadError.message}`);
      return;
    }

    // 2) Registrar la versión
    const res = await fetch('/api/dashboards/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title, client, visibility, path }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus('idle');
      setError(body.error ?? 'No se pudo registrar el dashboard.');
      return;
    }

    setResult({
      url: `${window.location.origin}/d/${slug}`,
      version: body.version,
      created: !!body.created,
    });
    setStatus('done');
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('No se pudo copiar el link.');
    }
  }

  if (status === 'done' && result) {
    return (
      <div className="panel">
        <div className="alert alert-ok" style={{ marginTop: 0 }}>
          {result.created ? 'Dashboard publicado.' : `Nueva versión publicada (v${result.version}).`}
        </div>
        <span className="field-label">Link</span>
        <div className="row">
          <input className="input" readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn" onClick={() => copy(result.url)}>
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
        </div>
        {visibility === 'team' && (
          <p className="hint">Solo el equipo con sesión iniciada puede abrirlo. Para clientes, crea un link desde el listado.</p>
        )}
        <div className="row" style={{ marginTop: 20 }}>
          <a className="btn btn-primary" href={result.url} target="_blank" rel="noreferrer">
            Abrir dashboard
          </a>
          <a className="btn" href="/">
            Ir al listado
          </a>
        </div>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pickFile(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <strong>{file ? file.name : 'Arrastra tu .html aquí o haz clic para elegirlo'}</strong>
        <small>
          {file ? `${(file.size / 1024).toFixed(0)} KB` : 'Un solo archivo, hasta 25 MB. Debe ser autocontenido.'}
        </small>
        <input
          ref={inputRef}
          type="file"
          accept=".html,.htm,text/html"
          hidden
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <label className="field">
        <span className="field-label">Título</span>
        <input
          className="input"
          value={title}
          maxLength={160}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Ej. Dashboard Kaloní — Q4 2026"
        />
      </label>

      <label className="field">
        <span className="field-label">URL</span>
        <div className="prefix-input">
          <span>/d/</span>
          <input
            className="input"
            value={slug}
            maxLength={80}
            disabled={!!prefill}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="dashboard-kaloni"
          />
        </div>
        {existingForSlug && !prefill && (
          <div className="alert alert-warn">
            Ya existe un dashboard con esta URL (v{existingForSlug.version}). Si continúas, se publicará como la
            versión {existingForSlug.version + 1} y reemplazará la actual en el mismo link. La versión
            anterior se conserva guardada, pero por ahora no hay botón para restaurarla.
          </div>
        )}
      </label>

      <label className="field">
        <span className="field-label">Cliente (opcional)</span>
        <input
          className="input"
          list="clients"
          value={client}
          maxLength={120}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Ej. Kaloní"
        />
        <datalist id="clients">
          {clients.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="field">
        <span className="field-label">Quién puede verlo</span>
        <select
          className="select"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as 'team' | 'link' | 'public')}
        >
          <option value="team">Solo el equipo Julius (con sesión)</option>
          <option value="link">Equipo + clientes con link privado</option>
          <option value="public">Público: cualquiera con la URL</option>
        </select>
        {visibility === 'public' && (
          <div className="alert alert-warn">
            Cualquiera que tenga la URL podrá verlo. No lo uses con datos sensibles de clientes.
          </div>
        )}
      </label>

      {error && <div className="alert alert-error">{error}</div>}

      <button className="btn btn-primary" disabled={status === 'uploading'}>
        {status === 'uploading' ? 'Publicando…' : prefill ? 'Publicar nueva versión' : 'Publicar dashboard'}
      </button>
    </form>
  );
}
