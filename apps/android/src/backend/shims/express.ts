/**
 * Just enough of Express for the API's routers and middleware to run inside
 * the app: routing with path parameters, middleware chains, async handlers,
 * error handlers and a response that collects the JSON body.
 */

export interface LocalRequest {
  method: string;
  /** Path relative to the current router mount, without the query string. */
  path: string;
  url: string;
  originalUrl: string;
  baseUrl: string;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  cookies: Record<string, string>;
  get(name: string): string | undefined;
  header(name: string): string | undefined;
  [key: string]: unknown;
}

export interface CookieOptions {
  expires?: Date;
  maxAge?: number;
  path?: string;
  [key: string]: unknown;
}

export interface LocalResponse {
  statusCode: number;
  headersSent: boolean;
  body: unknown;
  headers: Record<string, string>;
  cookies: Map<string, { value: string; options: CookieOptions } | null>;
  status(code: number): LocalResponse;
  json(body: unknown): LocalResponse;
  send(body?: unknown): LocalResponse;
  end(): LocalResponse;
  set(name: string, value: string): LocalResponse;
  setHeader(name: string, value: string): LocalResponse;
  cookie(name: string, value: string, options?: CookieOptions): LocalResponse;
  clearCookie(name: string, options?: CookieOptions): LocalResponse;
}

type Next = (err?: unknown) => void;
type Handler = (...args: unknown[]) => unknown;

interface Layer {
  path: string;
  /** Routes match the whole path; `use` matches a prefix. */
  end: boolean;
  method?: string;
  handler: Handler;
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function matchLayer(
  layer: Layer,
  path: string,
): { params: Record<string, string>; matched: string } | null {
  const pattern = splitPath(layer.path);
  const parts = splitPath(path);
  if (layer.end ? parts.length !== pattern.length : parts.length < pattern.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const p = pattern[i] as string;
    const v = parts[i] as string;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(v);
    else if (p !== v) return null;
  }
  return { params, matched: pattern.length ? `/${parts.slice(0, pattern.length).join('/')}` : '' };
}

export interface Router {
  (req: LocalRequest, res: LocalResponse, next: Next): void;
  use(...args: unknown[]): Router;
  get(path: string, ...handlers: Handler[]): Router;
  post(path: string, ...handlers: Handler[]): Router;
  put(path: string, ...handlers: Handler[]): Router;
  patch(path: string, ...handlers: Handler[]): Router;
  delete(path: string, ...handlers: Handler[]): Router;
  disable(name: string): Router;
  set(name: string, value: unknown): Router;
}

export function Router(): Router {
  const layers: Layer[] = [];

  const router = ((req: LocalRequest, res: LocalResponse, done: Next) => {
    let index = 0;
    const next: Next = (err) => {
      if (res.headersSent) return;
      while (index < layers.length) {
        const layer = layers[index++] as Layer;
        if (layer.method && layer.method !== req.method) continue;
        const match = matchLayer(layer, req.path);
        if (!match) continue;
        const isErrorHandler = layer.handler.length === 4;
        if ((err !== undefined) !== isErrorHandler) continue;
        if (layer.end) req.params = match.params;
        run(layer, match.matched, err);
        return;
      }
      done(err);
    };

    const run = (layer: Layer, matched: string, err: unknown) => {
      // Mounted routers see paths relative to their mount point.
      const { path, baseUrl } = req;
      if (!layer.end && matched) {
        req.path = path.slice(matched.length) || '/';
        req.baseUrl = baseUrl + matched;
      }
      const restore = () => {
        req.path = path;
        req.baseUrl = baseUrl;
      };
      const proceed: Next = (e) => {
        restore();
        next(e);
      };
      try {
        const result =
          err === undefined
            ? layer.handler(req, res, proceed)
            : layer.handler(err, req, res, proceed);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(undefined, (e: unknown) =>
            proceed(e ?? new Error('Rejected')),
          );
        }
      } catch (e) {
        proceed(e);
      }
    };

    next();
  }) as Router;

  const add = (method: string | undefined, end: boolean, path: string, handlers: unknown[]) => {
    for (const handler of handlers.flat()) {
      layers.push({ path, end, method, handler: handler as Handler });
    }
    return router;
  };

  router.use = (...args: unknown[]) =>
    typeof args[0] === 'string'
      ? add(undefined, false, args[0], args.slice(1))
      : add(undefined, false, '/', args);
  router.get = (path, ...h) => add('GET', true, path, h);
  router.post = (path, ...h) => add('POST', true, path, h);
  router.put = (path, ...h) => add('PUT', true, path, h);
  router.patch = (path, ...h) => add('PATCH', true, path, h);
  router.delete = (path, ...h) => add('DELETE', true, path, h);
  router.disable = () => router;
  router.set = () => router;
  return router;
}

/** Bodies arrive already read; this applies Express's JSON parsing rules. */
function json(opts: { limit?: string } = {}) {
  const limitKb = Number.parseInt(opts.limit ?? '100kb', 10);
  return (req: LocalRequest, _res: LocalResponse, next: Next) => {
    const raw = req.rawBody;
    const type = req.get('content-type') ?? '';
    if (typeof raw !== 'string' || !type.includes('json')) return next();
    if (raw.length > limitKb * 1024) {
      return next(
        Object.assign(new Error('request entity too large'), {
          type: 'entity.too.large',
          status: 413,
        }),
      );
    }
    try {
      req.body = raw ? JSON.parse(raw) : {};
      next();
    } catch {
      next(Object.assign(new Error('invalid json'), { type: 'entity.parse.failed', status: 400 }));
    }
  };
}

function express(): Router {
  return Router();
}
express.Router = Router;
express.json = json;

export { json };
export default express;
