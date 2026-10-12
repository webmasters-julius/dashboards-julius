# Dashboards Julius

Plataforma interna para que el equipo de Julius publique dashboards HTML (generados con Claude) y los comparta con clientes, sin pasar por un deploy manual.

## Cómo funciona

- **Subida:** el equipo entra a `/upload` con su correo @julius2grow.com, arrastra el `.html` y lo publica. El archivo va directo a Supabase Storage (bucket privado) y se registra en la tabla `dashboards`.
- **Visualización:** `/d/<slug>` lee el archivo y lo sirve como HTML. Subir una nueva versión con el mismo slug mantiene el mismo link.
- **Acceso por dashboard** (`visibility`):
  - `team`: solo equipo con sesión iniciada.
  - `link`: equipo + clientes con un link privado `?t=<token>` (revocable y con caducidad).
  - `public`: cualquiera con la URL.
- **Seguridad:** cada HTML se sirve con `Content-Security-Policy: sandbox` sin `allow-same-origin`, así que corre en un origen opaco y no puede leer la sesión ni las cookies de la app. Los tokens se guardan hasheados (SHA-256).

## Puesta en marcha

1. **Supabase:** crea un proyecto y ejecuta `supabase/schema.sql` completo en el SQL Editor.
2. **Auth en Supabase** (Authentication → URL Configuration):
   - Site URL: la URL de producción de Vercel.
   - Redirect URLs: `https://<tu-dominio>/auth/callback` y `http://localhost:3000/auth/callback`.
   - Para el envío de correos en producción configura un SMTP propio (Authentication → SMTP). El SMTP por defecto de Supabase tiene un límite muy bajo y solo entrega a miembros de la organización.
3. **Variables de entorno en Vercel** (ver `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (clave secreta; nunca con prefijo `NEXT_PUBLIC`)
   - `ALLOWED_EMAIL_DOMAIN` (por defecto `julius2grow.com`)
   - `ADMIN_EMAILS` (opcional; correos separados por coma que pueden borrar cualquier dashboard)
4. **Deploy:** conecta el repo a Vercel o despliega con la CLI.

## Desarrollo local

```bash
cp .env.example .env.local   # completa las claves
npm install
npm run dev
```

## Limitaciones conocidas

- Los dashboards corren en sandbox: no pueden usar `localStorage`/`sessionStorage` ni cookies. Las librerías por CDN y los `fetch` a APIs con CORS sí funcionan.
- Las versiones anteriores se conservan en Storage y en `dashboard_versions`, pero todavía no hay botón para restaurarlas.
- Tamaño máximo por archivo: 25 MB. El HTML debe ser autocontenido.
