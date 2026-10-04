import { Card } from '../components/Card';

interface PlannedFeaturePageProps {
  title: string;
  phase: number;
  /** What this screen will let the user do once built. */
  purpose: string;
  plannedCapabilities: string[];
}

/**
 * Honest placeholder for screens scheduled in later phases. It states plainly
 * that the feature is not built yet rather than imitating a working screen.
 */
export function PlannedFeaturePage({
  title,
  phase,
  purpose,
  plannedCapabilities,
}: PlannedFeaturePageProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-ink-500">{purpose}</p>
      <Card className="mt-8">
        <p className="text-sm font-medium text-ink-700">
          Not available yet. This screen is planned for phase {phase}.
        </p>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-ink-500">
          {plannedCapabilities.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
