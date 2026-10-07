import { incomingFileRoute } from '@/features/imports/incoming';

/**
 * Statements opened in MoneyLens from another app ("Open in", or a file
 * tapped in Files) arrive as file:// or content:// URLs. Send them to the
 * import screen; leave every other link to the router.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return incomingFileRoute(path) ?? path;
  } catch {
    return path;
  }
}
