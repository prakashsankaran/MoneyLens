import type { Env } from '../../config/env';

export interface AIRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
}

export interface AIResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * The only thing business logic knows about a language model. Providers get
 * prepared text and return text; they never see the database, documents or
 * identifiers, and never do arithmetic for the app.
 */
export interface AIProvider {
  /** "anthropic", "openai-compatible", "mock" or "none". */
  readonly name: string;
  readonly model: string | null;
  /** False for "none": the assistant then shows calculated figures only. */
  readonly configured: boolean;
  complete(req: AIRequest): Promise<AIResult>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new AIProviderError(
      err instanceof Error && err.name === 'TimeoutError'
        ? 'The AI provider did not answer in time.'
        : 'Could not reach the AI provider.',
    );
  }
  if (!res.ok) {
    // The body may echo the request; never log or surface it.
    throw new AIProviderError(`The AI provider returned HTTP ${res.status}.`, res.status);
  }
  return res.json();
}

/** Anthropic Messages API. */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly configured = true;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}

  async complete(req: AIRequest): Promise<AIResult> {
    const data = (await postJson(
      `${this.baseUrl}/v1/messages`,
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      { model: this.model, max_tokens: req.maxTokens, system: req.system, messages: req.messages },
      this.timeoutMs,
    )) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();
    if (!text) throw new AIProviderError('The AI provider returned an empty answer.');
    return {
      text,
      usage: data.usage
        ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
        : undefined,
    };
  }
}

/** Any service that speaks the OpenAI chat completions format. */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'openai-compatible';
  readonly configured = true;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async complete(req: AIRequest): Promise<AIResult> {
    const data = (await postJson(
      `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        max_tokens: req.maxTokens,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
      },
      this.timeoutMs,
    )) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new AIProviderError('The AI provider returned an empty answer.');
    return {
      text,
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
    };
  }
}

/**
 * Deterministic stand-in for tests and local development. It repeats the
 * first key figures it was given, so its answers always pass the figure check.
 * It is never chosen unless AI_PROVIDER=mock.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';
  readonly model = 'mock';
  readonly configured = true;

  async complete(req: AIRequest): Promise<AIResult> {
    const last = req.messages.at(-1)?.content ?? '';
    const figures = /Key figures[^\n]*\n((?:- .*\n?)+)/.exec(last)?.[1] ?? '';
    const lines = figures
      .split('\n')
      .map((l) => l.replace(/^- (\[[A-Z_]+\] )?/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
    return {
      text: lines.length
        ? `Here is what your calculated figures show. ${lines.join(' ')}`
        : 'I do not have figures for that question.',
    };
  }
}

/** AI_PROVIDER=none: nothing is sent anywhere. */
export class NoProvider implements AIProvider {
  readonly name = 'none';
  readonly model = null;
  readonly configured = false;
  complete(): Promise<AIResult> {
    return Promise.reject(new AIProviderError('No AI provider is configured.'));
  }
}

export function createAIProvider(env: Env): AIProvider {
  switch (env.AI_PROVIDER) {
    case 'anthropic':
      return new AnthropicProvider(
        env.AI_API_KEY as string,
        env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL,
        env.AI_TIMEOUT_MS,
        env.AI_BASE_URL,
      );
    case 'openai-compatible':
      return new OpenAICompatibleProvider(
        env.AI_API_KEY as string,
        env.AI_BASE_URL as string,
        env.AI_MODEL as string,
        env.AI_TIMEOUT_MS,
      );
    case 'mock':
      return new MockProvider();
    case 'none':
      return new NoProvider();
  }
}
