// Node's Buffer, which the statement parsers use. Must load before them.
import { Buffer } from 'buffer';

globalThis.Buffer ??= Buffer as unknown as typeof globalThis.Buffer;
