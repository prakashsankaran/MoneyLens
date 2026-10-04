/**
 * Masking helpers so sensitive identifiers are never shown in full by default.
 */

/** "rahul.sharma@okaxis" -> "ra••••••@okaxis". */
export function maskUpiId(upiId: string | null | undefined): string | null {
  if (!upiId) return null;
  const at = upiId.indexOf('@');
  if (at <= 0) return maskTail(upiId, 2);
  const handle = upiId.slice(0, at);
  const visible = handle.slice(0, Math.min(2, handle.length));
  return `${visible}${'•'.repeat(Math.max(handle.length - visible.length, 3))}${upiId.slice(at)}`;
}

/** Keep only the last `keep` characters: "426789123456" -> "••••3456". */
export function maskTail(value: string | null | undefined, keep = 4): string | null {
  if (!value) return null;
  if (value.length <= keep) return '•'.repeat(value.length);
  return `••••${value.slice(-keep)}`;
}
