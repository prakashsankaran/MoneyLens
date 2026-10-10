import type { ReactNode } from 'react';
import { LuShieldCheck, LuTrendingDown } from 'react-icons/lu';
import { Logo } from '../../components/Logo';

/** Decorative preview: shapes only, no figures before sign-in. */
function PreviewArt() {
  return (
    <div className="relative aspect-[5/4] w-full max-w-lg" aria-hidden="true">
      <div className="absolute inset-x-0 top-6 mx-auto w-[86%] rounded-2xl border border-white bg-white/90 p-5 shadow-lg backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-2.5 w-24 rounded-full bg-ink-200" />
            <div className="h-4 w-32 rounded-full bg-ink-900/80" />
          </div>
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-positive-50 px-2.5 text-2xs font-semibold text-positive">
            <LuTrendingDown className="size-3" /> Spend
          </span>
        </div>
        <svg viewBox="0 0 300 110" className="h-auto w-full">
          <defs>
            <linearGradient id="ml-la" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#3874FF" stopOpacity=".45" />
              <stop offset="1" stopColor="#3874FF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ml-lb" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#1E3A8A" stopOpacity=".35" />
              <stop offset="1" stopColor="#1E3A8A" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[20, 50, 80].map((y) => (
            <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="#EEF1F6" />
          ))}
          <path
            d="M0 70 C40 60 60 40 100 45 S170 20 210 28 S270 10 300 14 V110 H0Z"
            fill="url(#ml-la)"
          />
          <path
            d="M0 70 C40 60 60 40 100 45 S170 20 210 28 S270 10 300 14"
            fill="none"
            stroke="#3874FF"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M0 92 C50 88 80 72 120 76 S190 60 230 64 S280 52 300 50 V110 H0Z"
            fill="url(#ml-lb)"
          />
          <path
            d="M0 92 C50 88 80 72 120 76 S190 60 230 64 S280 52 300 50"
            fill="none"
            stroke="#1E3A8A"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="210" cy="28" r="5" fill="#fff" stroke="#3874FF" strokeWidth="3" />
        </svg>
      </div>
      <div className="absolute bottom-2 left-0 w-40 animate-float-slow rounded-2xl border border-white bg-white/95 p-4 shadow-lg">
        <svg viewBox="0 0 42 42" className="mx-auto size-20 -rotate-90">
          {(
            [
              ['#3874FF', 0, 34],
              ['#1E3A8A', 36, 28],
              ['#94A3B8', 66, 8],
              ['#93C5FD', 76, 22],
            ] as const
          ).map(([c, o, l]) => (
            <circle
              key={c}
              cx="21"
              cy="21"
              r="15.9"
              fill="none"
              stroke={c}
              strokeWidth="5"
              strokeDasharray={`${l} ${100 - l}`}
              strokeDashoffset={-o}
              pathLength={100}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="mx-auto mt-3 h-2 w-16 rounded-full bg-ink-200" />
      </div>
      <div className="absolute right-0 bottom-0 w-44 animate-float-slower rounded-2xl border border-white bg-white/95 p-4 shadow-lg">
        <div className="flex h-20 items-end gap-2">
          {[55, 80, 40, 95, 70].map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-md"
              style={{ height: `${h}%`, background: i === 3 ? '#3874FF' : '#DCE6FF' }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <LuShieldCheck className="size-3.5" />
          </span>
          <span className="h-2 flex-1 rounded-full bg-ink-200" />
        </div>
      </div>
    </div>
  );
}

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
    <div className="relative min-h-dvh overflow-hidden bg-canvas">
      {/* Soft colour field and dot grid */}
      <div className="pointer-events-none absolute -top-40 -left-32 size-[36rem] rounded-full bg-brand-600/25 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-40 size-[32rem] rounded-full bg-blue-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-1/3 size-[28rem] rounded-full bg-slate-300/30 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(15_23_42/.06)_1px,transparent_1px)] [background-size:22px_22px]" />

      <div className="relative mx-auto grid min-h-dvh max-w-[1200px] items-center gap-10 px-4 py-8 md:px-6 lg:grid-cols-2 lg:px-8">
        <div className="hidden flex-col gap-10 lg:flex">
          <Logo />
          <div className="max-w-md space-y-3">
            <p className="text-3xl leading-tight font-bold text-ink-900">
              See where your money goes, <span className="text-brand-600">at a glance.</span>
            </p>
            <p className="text-base text-ink-700">
              Spending, savings and saving ideas from your own statements.
            </p>
          </div>
          <PreviewArt />
        </div>

        <main className="mx-auto w-full max-w-md animate-page-enter">
          <div className="rounded-3xl border border-white bg-surface/90 p-6 shadow-lg backdrop-blur-xl md:p-8">
            <Logo className="mb-8 lg:hidden" />
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
