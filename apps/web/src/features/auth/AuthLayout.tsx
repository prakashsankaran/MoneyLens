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
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-brand-50/60 via-canvas to-canvas px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-ink-200/70 bg-surface p-6 shadow-card sm:p-10">
        <Logo className="mb-10" />
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
