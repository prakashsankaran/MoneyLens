import { LuMail } from 'react-icons/lu';
import { formatMonthKey } from '@moneylens/shared';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useSendMonthlySummary, useUpdatePreferences, usePreferences } from './usePreferences';

/**
 * Switch the monthly summary email on or off, and send one now to see it.
 * Needs an email account on the server (the same Gmail app password as
 * password reset emails).
 */
export function MonthlyEmailCard() {
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const sendNow = useSendMonthlySummary();
  const summary = prefs.data?.monthlySummary;

  return (
    <Card
      title="Monthly email"
      icon={LuMail}
      description="A short summary of each month when it ends: what you spent and received, where the money went, your biggest payments and what is worth a look."
    >
      {prefs.isPending ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : prefs.isError ? (
        <p role="alert" className="text-sm text-negative">
          {prefs.error.message}
        </p>
      ) : !summary?.available ? (
        <p className="text-sm text-ink-500">
          Email is not set up on this MoneyLens yet. Whoever runs it can switch it on for free with
          a Gmail app password, the same one password reset emails use (see docs/PASSWORD_RESET.md).
        </p>
      ) : (
        <div className="space-y-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0"
              checked={summary.enabled}
              disabled={update.isPending}
              onChange={(e) => update.mutate({ monthlySummaryEmail: e.target.checked })}
            />
            <span>
              <span className="block font-medium text-ink-900">
                Email me a summary when each month ends
              </span>
              <span className="block text-ink-500">
                Sent to {summary.sendTo} on the 1st, for the month before.
                {summary.lastSentFor &&
                  ` The last one was for ${formatMonthKey(summary.lastSentFor)}.`}
              </span>
            </span>
          </label>
          <Button variant="secondary" disabled={sendNow.isPending} onClick={() => sendNow.mutate()}>
            {sendNow.isPending ? 'Sending…' : "Send last month's summary now"}
          </Button>
          {(update.isError || sendNow.isError || sendNow.isSuccess) && (
            <p
              role={sendNow.isSuccess && !update.isError ? 'status' : 'alert'}
              className={`text-sm ${sendNow.isSuccess && !update.isError ? 'text-positive' : 'text-negative'}`}
            >
              {update.isError
                ? update.error.message
                : sendNow.isError
                  ? sendNow.error.message
                  : sendNow.data &&
                    `Sent the ${formatMonthKey(sendNow.data.month)} summary to ${sendNow.data.sentTo}. It can take a minute to arrive.`}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
