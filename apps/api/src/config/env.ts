import { z } from 'zod';

/**
 * Environment configuration, validated once at startup. The process refuses to
 * start with a missing or weak secret rather than running insecurely.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  /** Requests per 15 minutes per IP on credential endpoints. */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  /** Requests per minute per IP across the API. */
  API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  /** Set when running behind a reverse proxy so client IPs are correct. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

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
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && /change-me/i.test(env.JWT_ACCESS_SECRET)) {
    throw new Error('JWT_ACCESS_SECRET still has the example value; set a real secret.');
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
