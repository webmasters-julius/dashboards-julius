import Link from 'next/link';

export default function Header({ email }: { email: string }) {
  return (
    <header className="header">
      <Link href="/" className="brand">
        <span className="brand-mark">[</span>
        Dashboards Julius
      </Link>
      <div className="header-right">
        <Link href="/upload" className="btn btn-primary">
          Subir dashboard
        </Link>
        <span>{email}</span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-sm">
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
