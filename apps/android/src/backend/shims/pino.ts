/** A console-backed logger with pino's method names. Only problems are printed. */
export interface LocalLogger {
  level: string;
  fatal(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  trace(...args: unknown[]): void;
  child(): LocalLogger;
}

export function pino(): LocalLogger {
  const quiet = () => {};
  const logger: LocalLogger = {
    level: 'warn',
    fatal: (...args) => console.error(...args),
    error: (...args) => console.error(...args),
    warn: (...args) => console.warn(...args),
    info: quiet,
    debug: quiet,
    trace: quiet,
    child: () => logger,
  };
  return logger;
}

export default pino;
