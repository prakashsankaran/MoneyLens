import { createApp } from '../../../api/src/app';
import { loadEnv } from '../../../api/src/config/env';
import { seedCategories } from '../../../api/src/modules/categories/seed-categories';
import { database, PrismaClient } from './prisma';
import { cookieJar } from './cookies';
import { pino } from './shims/pino';
import type { CookieOptions, LocalRequest, LocalResponse, Router } from './shims/express';
import type { UploadPart } from './shims/multer';
import { autoSave, deserialize, readSaved } from './storage';

/**
 * Runs the MoneyLens API inside the app. `createApp` is the same code the
 * server runs; here its database is the on-device one and requests from the
 * web app's `fetch('/api/...')` are answered in-process. No request leaves
 * the phone.
 */

const SECRET_KEY = 'moneylens.secret';

/** A random per-install secret for the API's sign-in tokens. */
function installSecret(): string {
  let secret = localStorage.getItem(SECRET_KEY);
  if (!secret) {
    secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    localStorage.setItem(SECRET_KEY, secret);
  }
  return secret;
}

interface Backend {
  app: Router;
  flush: () => Promise<void>;
}

async function startBackend(): Promise<Backend> {
  const saved = await readSaved();
  if (saved) deserialize(database, saved);
  const prisma = new PrismaClient();
  // Built-in categories, including any added by an app update.
  await seedCategories(prisma as never);
  const { flush } = autoSave(database);
  void navigator.storage?.persist?.();

  const env = loadEnv({
    NODE_ENV: 'production',
    DATABASE_URL: 'memory://on-device',
    JWT_ACCESS_SECRET: installSecret(),
    LOG_LEVEL: 'silent',
    // Phones are slower than servers; give big statements time to parse.
    PARSE_TIMEOUT_MS: '60000',
    // Sends data to an AI service, so it stays off on the phone.
    AI_PROVIDER: 'none',
  });
  const app = createApp({
    env,
    prisma: prisma as never,
    logger: pino() as never,
  }) as unknown as Router;
  return { app, flush };
}

let backend: Promise<Backend> | undefined;

function queryOf(params: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [k, v] of params) {
    const existing = query[k];
    query[k] =
      existing === undefined ? v : [...(Array.isArray(existing) ? existing : [existing]), v];
  }
  return query;
}

async function uploadParts(form: FormData) {
  const fields: Record<string, string> = {};
  const files: UploadPart[] = [];
  for (const [name, value] of form) {
    if (typeof value === 'string') fields[name] = value;
    else {
      files.push({
        fieldname: name,
        originalname: value.name,
        mimetype: value.type,
        bytes: new Uint8Array(await value.arrayBuffer()),
      });
    }
  }
  return { fields, files };
}

/** Answer one API request in-process. */
export async function handleApiRequest(url: URL, init: RequestInit = {}): Promise<Response> {
  backend ??= startBackend();
  const { app, flush } = await backend;

  const method = (init.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, name) => (headers[name.toLowerCase()] = value));
  headers['user-agent'] ??= `MoneyLens Android app (${navigator.userAgent})`;

  const req = {
    method,
    path: url.pathname,
    url: url.pathname + url.search,
    originalUrl: url.pathname + url.search,
    baseUrl: '',
    query: queryOf(url.searchParams),
    params: {},
    headers,
    body: undefined,
    cookies: cookieJar.all(),
    get: (name: string) => headers[name.toLowerCase()],
    header: (name: string) => headers[name.toLowerCase()],
  } as LocalRequest;
  if (init.body instanceof FormData) req.uploadParts = await uploadParts(init.body);
  else if (typeof init.body === 'string') req.rawBody = init.body;

  const response = await new Promise<LocalResponse>((resolve) => {
    const res: LocalResponse = {
      statusCode: 200,
      headersSent: false,
      body: undefined,
      headers: {},
      cookies: new Map(),
      status(code) {
        res.statusCode = code;
        return res;
      },
      json(body) {
        res.body = body;
        return res.end();
      },
      send(body) {
        res.body = body;
        return res.end();
      },
      end() {
        if (!res.headersSent) {
          res.headersSent = true;
          resolve(res);
        }
        return res;
      },
      set(name, value) {
        res.headers[name.toLowerCase()] = value;
        return res;
      },
      setHeader(name, value) {
        return res.set(name, value);
      },
      cookie(name: string, value: string, options: CookieOptions = {}) {
        res.cookies.set(name, { value, options });
        return res;
      },
      clearCookie(name: string) {
        res.cookies.set(name, null);
        return res;
      },
    };
    app(req, res, (err) => {
      console.error('Unhandled API request', method, url.pathname, err);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
      });
    });
  });

  for (const [name, cookie] of response.cookies) {
    if (cookie) cookieJar.set(name, cookie.value, cookie.options.expires);
    else cookieJar.remove(name);
  }
  if (method !== 'GET') await flush();

  const body = response.body === undefined ? null : JSON.stringify(response.body);
  return new Response(response.statusCode === 204 ? null : body, {
    status: response.statusCode,
    headers: { 'content-type': 'application/json', ...response.headers },
  });
}

/** Route the web app's `/api` calls to the in-app API; everything else is untouched. */
export function installLocalApi(): void {
  const networkFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      return handleApiRequest(url, init);
    }
    return networkFetch(input, init);
  };
  // Start loading saved data while the app renders.
  backend ??= startBackend();
}
