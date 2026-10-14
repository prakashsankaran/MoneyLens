/**
 * Server-only middleware (security headers, CORS, request logging, rate
 * limits) has nothing to do inside the app: no other site or client can
 * reach this API. Each is replaced by a step that just continues.
 */
type Next = (err?: unknown) => void;

export const passthrough =
  () =>
  (_req: unknown, _res: unknown, next: Next): void =>
    next();

export default passthrough;
export const rateLimit = passthrough;
export const pinoHttp = passthrough;

/** cookie-parser: the dispatcher already put the cookies on the request. */
export function cookieParser() {
  return (req: { cookies?: Record<string, string> }, _res: unknown, next: Next) => {
    req.cookies ??= {};
    next();
  };
}
