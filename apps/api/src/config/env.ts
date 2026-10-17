import { z } from 'zod';

/**
 * Environment configuration, validated once at startup. The process refuses to
 * start with a missing or weak secret rather than running insecurely.
 */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const commaList = z.string().default('').transform(splitList);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGINS: z.string().default('http://localhost:5173').transform(splitList),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  /** How long one statement may take to parse before the upload is refused. */
  PARSE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),
  /** Requests per 15 minutes per IP on credential endpoints. */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  /** Failed sign-ins for one account within LOGIN_LOCKOUT_MINUTES before it is paused. */
  LOGIN_LOCKOUT_ATTEMPTS: z.coerce.number().int().positive().default(10),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  /** Requests per minute per IP across the API. */
  API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  /**
   * Folder holding the built web app (apps/web/dist). When set, the API also
   * serves the app, so one container is enough (free single-service hosts).
   */
  WEB_DIST_DIR: z.string().trim().optional(),
  /** Set when running behind a reverse proxy so client IPs are correct. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  /**
   * Who may create an account. `open`: anyone who can reach the app;
   * `invite`: only with one of SIGNUP_INVITE_CODES; `closed`: nobody.
   */
  SIGNUP_MODE: z.enum(['open', 'invite', 'closed']).default('open'),
  /** Comma-separated invite codes for SIGNUP_MODE=invite (one per friend works well). */
  SIGNUP_INVITE_CODES: commaList,

  /**
   * Email account for password reset links. All three of host, user and
   * password set: "Email me a reset link" is offered; otherwise it is hidden.
   */
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASS: z.string().trim().optional(),
  /** Sender shown on emails; defaults to "MoneyLens <SMTP_USER>". */
  MAIL_FROM: z.string().trim().optional(),
  /**
   * The app's address as people open it, for links in emails. Defaults to
   * the first of CORS_ORIGINS.
   */
  APP_URL: z.string().trim().url().optional(),

  /** MoneyLens AI. `none` shows calculated figures only; `mock` is for tests. */
  AI_PROVIDER: z.enum(['none', 'mock', 'anthropic', 'openai-compatible']).default('none'),
  AI_MODEL: z.string().trim().optional(),
  AI_API_KEY: z.string().trim().optional(),
  /** Base URL for `openai-compatible` (e.g. https://api.example.com/v1). */
  AI_BASE_URL: z.string().trim().url().optional(),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(4000).default(700),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  /** Questions per user per rolling 24 hours. */
  AI_DAILY_MESSAGE_LIMIT: z.coerce.number().int().positive().default(50),
  /** Questions per user per minute. */
  AI_CHAT_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  /**
   * Comma-separated emails that may use the AI provider. Empty: every account.
   * Everyone else gets calculated figures only, as with AI_PROVIDER=none, so
   * a shared server does not spend the owner's AI key on other people.
   */
  AI_ALLOWED_EMAILS: commaList.transform((list) => list.map((e) => e.toLowerCase())),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // An empty variable (`AI_BASE_URL=` in a .env or compose file) means unset.
  const present = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  // On Render the app's own https address is known only after it is created;
  // Render provides it, so it is the default trusted origin there.
  present.CORS_ORIGINS ??= present.RENDER_EXTERNAL_URL;
  const parsed = envSchema.safeParse(present);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && /change-me/i.test(env.JWT_ACCESS_SECRET)) {
    throw new Error('JWT_ACCESS_SECRET still has the example value; set a real secret.');
  }
  if (env.SIGNUP_MODE === 'invite') {
    if (env.SIGNUP_INVITE_CODES.length === 0) {
      throw new Error('SIGNUP_MODE=invite needs at least one code in SIGNUP_INVITE_CODES.');
    }
    if (env.SIGNUP_INVITE_CODES.some((code) => code.length < 8 || code.length > 64)) {
      throw new Error('Each invite code in SIGNUP_INVITE_CODES must be 8 to 64 characters.');
    }
  }
  const smtpSet = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS].filter(Boolean).length;
  if (smtpSet > 0 && smtpSet < 3) {
    throw new Error('Email needs all of SMTP_HOST, SMTP_USER and SMTP_PASS (or none of them).');
  }
  if (
    (env.AI_PROVIDER === 'anthropic' || env.AI_PROVIDER === 'openai-compatible') &&
    !env.AI_API_KEY
  ) {
    throw new Error(`AI_PROVIDER=${env.AI_PROVIDER} needs AI_API_KEY.`);
  }
  if (env.AI_PROVIDER === 'openai-compatible' && (!env.AI_BASE_URL || !env.AI_MODEL)) {
    throw new Error('AI_PROVIDER=openai-compatible needs AI_BASE_URL and AI_MODEL.');
  }
  return env;
}
