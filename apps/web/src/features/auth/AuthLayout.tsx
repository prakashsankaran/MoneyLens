import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mb-10" />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
