import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, MockProvider, OpenAICompatibleProvider } from './providers';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const req = {
  system: 'rules',
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxTokens: 300,
};

describe('AnthropicProvider', () => {
  it('calls the Messages API and joins the text blocks', async () => {
    const fetch = stubFetch(200, {
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'there' },
      ],
      usage: { input_tokens: 10, output_tokens: 2 },
    });
    const p = new AnthropicProvider('key', 'claude-sonnet-5-5', 5000);
    await expect(p.complete(req)).resolves.toEqual({
      text: 'Hello there',
      usage: { inputTokens: 10, outputTokens: 2 },
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({ 'x-api-key': 'key', 'anthropic-version': '2023-06-01' });
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 300,
      system: 'rules',
      messages: req.messages,
    });
  });

  it('reports HTTP errors without the response body', async () => {
    stubFetch(401, { error: { message: 'invalid x-api-key secret-ish' } });
    const p = new AnthropicProvider('key', 'm', 5000);
    await expect(p.complete(req)).rejects.toThrow('The AI provider returned HTTP 401.');
  });
});

describe('OpenAICompatibleProvider', () => {
  it('sends the system prompt as the first message', async () => {
    const fetch = stubFetch(200, { choices: [{ message: { content: 'Answer' } }] });
    const p = new OpenAICompatibleProvider('key', 'https://llm.example/v1/', 'model-x', 5000);
    await expect(p.complete(req)).resolves.toMatchObject({ text: 'Answer' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://llm.example/v1/chat/completions');
    expect(init.headers).toMatchObject({ authorization: 'Bearer key' });
    expect(JSON.parse(init.body as string).messages[0]).toEqual({
      role: 'system',
      content: 'rules',
    });
  });
});

describe('MockProvider', () => {
  it('repeats the key figures it was given', async () => {
    const r = await new MockProvider().complete({
      ...req,
      messages: [
        {
          role: 'user',
          content:
            'Key figures (already calculated):\n- [CALCULATION] You spent ₹100.\n- [OBSERVATION] Food rose.\n\nQuestion: hi',
        },
      ],
    });
    expect(r.text).toBe('Here is what your calculated figures show. You spent ₹100. Food rose.');
  });
});
