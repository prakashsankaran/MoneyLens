# AI architecture (design; phase 6)

> **Status:** designed, not implemented. The `AIConversation` and `AIMessage`
> tables exist. The dashboard shows an explicit "not available yet" card in
> place of the AI Money Brief.

## Principles

1. **AI never does arithmetic.** Every number comes from `@moneylens/analytics`.
   The model only explains numbers it is given.
2. **AI gets structured, sanitised context, never the raw database or
   documents.** No UPI IDs, references, account numbers or raw descriptions.
3. **Provenance is explicit.** Model output is stored and shown as
   `AI_INTERPRETATION`. Numbers rendered next to it come from the API payload,
   not from the text.
4. **Vendor-neutral.** Business logic depends on an interface, and the provider
   is chosen by environment configuration.

## AIProvider

```ts
interface AIProvider {
  readonly name: string; // 'anthropic', 'openai-compatible', 'mock'
  complete(req: {
    system: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    context: FinancialContext; // serialised as JSON in the prompt
    maxTokens: number;
  }): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>;
}
```

`AI_PROVIDER=mock|anthropic|openai-compatible`, with `AI_MODEL`, `AI_API_KEY`
and `AI_BASE_URL`. The `mock` provider is deterministic and used in tests and
when no key is configured. The UI then states that the assistant is not
configured, rather than faking answers.

## FinancialContext

Built by a `ContextBuilder` from analytics outputs only:

```jsonc
{
  "period": "2026-09",
  "monthsAvailable": ["2026-04", "…"],
  "totals": { "incomePaise": 0, "spendingPaise": 0, "savedPaise": 0, "savingsRatePct": 0 },
  "categoryBreakdown": [{ "name": "Food", "amountPaise": 0, "sharePct": 0 }],
  "topMerchants": [{ "name": "Swiggy", "amountPaise": 0, "transactionCount": 0 }],
  "trends": [],
  "recurringExpenses": [],
  "observations": [],
  "anomalies": [],
  "dataLimitations": ["Only one month of data is available"],
}
```

Questions are routed by a small intent classifier, which can be keyword based
at first, so the builder can include the relevant slice. For example, "food:
frequency vs size" includes count and average per month for that category.

## Guardrails

- The system prompt forbids inventing transactions, amounts or merchants, doing
  calculations, giving guaranteed returns, recommending illegal activity, and
  asking for a UPI PIN, passwords or credentials. It requires naming data
  limitations.
- **Output check:** every currency amount and percentage in the response must
  match a value in the context (with formatting tolerance). Otherwise the
  answer is regenerated once, then replaced with a safe fallback.
- Refusal patterns for credential requests and regulated advice. Planning text
  carries the "educational, not professional financial advice" label.
- Rate limits and token budgets per user. Conversations can be deleted with
  the account.
- An evaluation suite of the brief's example questions against fixed contexts,
  checking that the answers are grounded.
