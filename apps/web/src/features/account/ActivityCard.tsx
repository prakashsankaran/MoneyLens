import { useQuery } from '@tanstack/react-query';
import { LuHistory, LuShieldAlert } from 'react-icons/lu';
import type { AuthActivityItem } from '@moneylens/types';
import {
  AUTH_EVENT_LABEL,
  AUTH_EVENT_WARNING,
  describeDevice,
  formatDayTime,
} from '@moneylens/shared';
import { Card } from '../../components/Card';
import { api } from '../../lib/api-client';

function useAuthActivity() {
  return useQuery({
    queryKey: ['auth-activity'],
    queryFn: () => api<AuthActivityItem[]>('/auth/activity'),
  });
}

/** Recent sign-ins, so the owner can spot activity that was not theirs. */
export function ActivityCard() {
  const { data, isPending, isError, error } = useAuthActivity();
  return (
    <Card
      title="Recent sign-in activity"
      icon={LuHistory}
      description="The last 20 events on your account, kept for 90 days. If something here wasn't you, change your password above."
    >
      {isPending ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-negative">{error.message}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-ink-500">No activity recorded yet.</p>
      ) : (
        <ul className="divide-y divide-ink-100 text-sm">
          {data.map((e, i) => {
            const warn = AUTH_EVENT_WARNING.has(e.type);
            return (
              <li key={`${e.at}-${i}`} className="flex items-start gap-3 py-2.5">
                {warn ? (
                  <LuShieldAlert
                    className="mt-0.5 size-4 shrink-0 text-warning"
                    aria-label="Worth a look"
                  />
                ) : (
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-ink-300"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className={warn ? 'font-medium text-ink-900' : 'text-ink-800'}>
                    {AUTH_EVENT_LABEL[e.type]}
                  </p>
                  <p className="text-ink-500">
                    {describeDevice(e.userAgent)} · {formatDayTime(e.at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
