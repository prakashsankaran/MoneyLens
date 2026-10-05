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

const UPI_IN_TEXT = /\b[a-z0-9][a-z0-9._]{1,63}@[a-z][a-z0-9]{1,30}\b/gi;
/** Card numbers (incl. partly masked ones), account and reference numbers. */
const LONG_NUMBER_IN_TEXT = /\b[0-9X*]{8,}\b/gi;

/**
 * Mask identifiers inside free text such as a bank narration, e.g.
 * "UPI-SWIGGY-swiggy@icici-424698765432" -> "UPI-SWIGGY-sw••••@icici-••••5432".
 * Any run of 8+ digits keeps only its last four.
 */
export function maskIdentifiersInText(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  return text
    .replace(UPI_IN_TEXT, (m) => maskUpiId(m) ?? m)
    .replace(LONG_NUMBER_IN_TEXT, (m) => (/\d/.test(m) ? (maskTail(m) ?? m) : m));
}
