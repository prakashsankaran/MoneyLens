import { config } from 'zod';

// The production CSP forbids eval. Zod would otherwise probe for it (logging a
// CSP violation) and validates the same way without it. Imported first in
// main.tsx so it runs before any module parses with a schema.
config({ jitless: true });
