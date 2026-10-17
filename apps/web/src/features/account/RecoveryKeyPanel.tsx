import { useState } from 'react';
import { LuCheck, LuCopy, LuDownload } from 'react-icons/lu';
import { Button } from '../../components/Button';
import { deviceAI } from '../../lib/device';

/**
 * Shows a recovery key the one time it exists in readable form, with ways to
 * keep it. `onDone` is offered once the owner says they have saved it.
 */
export function RecoveryKeyPanel({
  recoveryKey,
  email,
  doneLabel = 'Continue',
  onDone,
}: {
  recoveryKey: string;
  email?: string | undefined;
  doneLabel?: string;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  // The Android app's web view cannot save files, so it suggests a screenshot instead.
  const onPhone = Boolean(deviceAI());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const text = [
      'MoneyLens recovery key',
      '',
      ...(email ? [`Account: ${email}`] : []),
      `Recovery key: ${recoveryKey}`,
      '',
      'If you forget your password, choose "Forgot password?" on the sign-in screen',
      'and enter this key. Keep it somewhere safe and private.',
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'moneylens-recovery-key.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-center">
        <p className="text-xs font-semibold tracking-wide text-brand-800 uppercase">
          Your recovery key
        </p>
        {/* Split after the third group, so the key never wraps mid-group. */}
        <p
          className="mt-2 font-mono text-lg font-semibold tracking-wider text-ink-900 sm:text-xl"
          data-testid="recovery-key"
        >
          <span className="block">{recoveryKey.slice(0, 15)}</span>
          <span className="block">{recoveryKey.slice(15)}</span>
        </p>
      </div>
      <p className="text-sm text-ink-700">
        If you ever forget your password, this key lets you set a new one. It is shown only now, so{' '}
        {onPhone ? 'write it down or take a screenshot' : 'copy it or download it'} and keep it
        somewhere safe, like a password manager.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          {copied ? (
            <LuCheck className="size-4" aria-hidden="true" />
          ) : (
            <LuCopy className="size-4" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {!onPhone && (
          <Button type="button" variant="secondary" onClick={download}>
            <LuDownload className="size-4" aria-hidden="true" />
            Download
          </Button>
        )}
      </div>
      <label className="flex items-start gap-2.5 text-sm text-ink-900">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-brand-600"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I have saved my recovery key
      </label>
      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
