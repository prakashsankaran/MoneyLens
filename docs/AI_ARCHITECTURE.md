# AI architecture

> **Status:** implemented in Phase 6. MoneyLens AI answers questions on
> `/assistant`, and the dashboard shows the AI Money Brief. With
> `AI_PROVIDER=none` (the default), both still work and show the calculated
> figures, and say plainly that no written explanation is available.

## Principles

1. **AI never does arithmetic.** Every number comes from `@moneylens/analytics`.
   Totals, differences, percentages, averages per payment, running totals of
   saving opportunities and "frequency or size" drivers are calculated before
   the model sees anything. The model only words them.
2. **AI gets aggregates, never raw data.** The model receives monthly totals,
   category and merchant summaries, comparisons, recurring series and insight
   titles. It never receives statements, transaction lists, UPI IDs,
   references, account numbers or transaction ids.
3. **Provenance is explicit.** Model text is labelled `AI_INTERPRETATION`.
   The calculated statements it was written from are shown beside it,
   labelled `CALCULATION` or `OBSERVATION`.
4. **Vendor-neutral.** Business logic depends on the `AIProvider` interface.
   The provider is chosen by environment configuration.

## Request flow

```
question
  → screenInput (refuse credentials / illegal requests; mask identifiers)
  → InsightsService.context + saved money plan
  → assistantContext()            packages/analytics/src/assistant.ts (pure, paise)
  → classifyQuestion + factsFor   topics → calculated statements
  → contextFor + questionTurn     only the slice the topics need, amounts formatted as ₹
  → AIProvider.complete
  → checkGrounding                every ₹ amount and % must exist in the context
      ✗ → one retry with the problems listed → ✗ → figures only ("fallback")
  → stored as AIMessage (question masked; answer + facts in contextRef)
```

## AIProvider

```ts
interface AIProvider {
  readonly name: string; // 'anthropic' | 'openai-compatible' | 'mock' | 'none'
  readonly model: string | null;
  readonly configured: boolean;
  complete(req: { system; messages; maxTokens }): Promise<{ text; usage? }>;
}
```

| `AI_PROVIDER`       | Behaviour                                                                       |
| ------------------- | ------------------------------------------------------------------------------- |
| `none` (default)    | Nothing is sent anywhere. Answers carry the calculated figures only.            |
| `anthropic`         | Messages API. Needs `AI_API_KEY`; `AI_MODEL` defaults to `claude-sonnet-5-5`.   |
| `openai-compatible` | Any `/chat/completions` service. Needs `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`. |
| `mock`              | Deterministic; repeats the key figures. For tests and local development.        |

Providers call the vendor with `fetch`, with a timeout (`AI_TIMEOUT_MS`).
Errors report only the HTTP status, never the response body. The process
refuses to start when a provider is chosen without the settings it needs.

## Assistant context

`assistantContext()` returns `AssistantContext` (see `@moneylens/types`) for
one month:

- totals, the previous month and the change;
- period comparisons (3- and 6-month averages, quarter, year to date);
- top-level and subcategory changes, each with counts, average per payment,
  and a driver: `frequency`, `size`, `both` or `neither`, using a 10%
  threshold;
- top merchants and the six-month trend;
- active recurring payments with monthly and annual totals;
- potential saving opportunities, largest first, with a running total;
- insight titles, health score components, weekday and weekend averages;
- the saved money plan's surplus;
- `dataLimitations`: plain sentences such as "I only have transaction data
  for September 2026, so I cannot compare it with earlier months or judge a
  long-term trend."

## Question routing and facts

`classifyQuestion` is keyword based. It maps a question to topics:

| Topic        | Covers                                     |
| ------------ | ------------------------------------------ |
| `overview`   | Always included                            |
| `change`     | What changed                               |
| `merchants`  | Top merchants                              |
| `categories` | Where the money went                       |
| `increasing` | Categories that are rising                 |
| `savings`    | Savings and leaks                          |
| `driver`     | Frequency vs size                          |
| `recurring`  | Recurring payments                         |
| `compare`    | Comparisons with the 3- or 6-month average |
| `health`     | The health score                           |
| `plan`       | The money plan                             |

`matchCategory` finds a named category; merchant names map to their
category, for example Swiggy to Food Delivery.

`factsFor` turns topics into worded statements. Its templates choose and word
figures and never calculate them. For example, "Where can I save ₹5,000?"
reports whether the running total of opportunities reaches ₹5,000, using the
running total calculated by the engine.

## Guardrails

- **Input** (`screenInput`):
  - Messages that contain a PIN, password, OTP, CVV or card number are
    refused. They are never sent to a provider and are stored only as a
    placeholder.
  - Requests for help with tax evasion, laundering, hawala, benami deals or
    fake invoices and receipts are refused.
  - UPI IDs and long numbers are masked in every other message before it is
    stored or sent.
- **System prompt** (`prompt.ts`):
  - It forbids inventing figures, doing arithmetic, the word "waste",
    recommending specific products, guaranteed returns, asking for
    credentials, and illegal suggestions.
  - It requires stating data limitations and phrasing interpretations as
    possibilities.
- **Output** (`checkGrounding`):
  - Every ₹ amount and percentage in the answer must match a figure in the
    full context or the question. Matching allows for how precisely the
    figure was written: ₹1.45 lakh matches 1,45,000 ± 500, and 42% matches
    41.6%.
  - Any of the following fails the check:
    - "waste" or its variants;
    - "guaranteed returns" (but "not guaranteed" passes);
    - asking for a PIN, password or OTP.
  - A failure gets one retry with the problems listed. A second failure
    shows the figures only.
- **Limits:**
  - `AI_CHAT_RATE_LIMIT` questions per user per minute.
  - The brief has its own budget, three times the chat limit, so dashboard
    visits do not use up questions.
  - `AI_DAILY_MESSAGE_LIMIT` questions per rolling 24 hours.
  - `AI_MAX_OUTPUT_TOKENS` per answer.
- **Deletion:** conversations can be deleted one at a time or all together.
  Deleting all transactions deletes them, since they quote figures from
  them. Deleting the account cascades.

## AI Money Brief

`GET /api/ai/brief` builds at most five statements:

- the month's totals;
- the largest categories;
- the change from last month;
- the largest saving opportunity;
- recurring payments.

The provider writes 3–4 sentences from those statements, and the same figure
check applies. The result is cached in memory for 12 hours, keyed by user,
month, a hash of the statements and the provider. The brief is rewritten
when the figures change. A provider failure is not cached.

## Evaluation

`apps/api/test/ai.test.ts` runs the nine example questions from the product
brief against the seeded demo data.

- **Routing and facts:** for each question it checks the routing, that the
  expected calculated statement is present, and that nothing says "waste".
- **What the model is sent:** other tests check the prompt carries rules and
  aggregates but no identifiers.
- **Figure check:** an invented figure triggers a regeneration, and repeated
  failures fall back to figures only.
- **Failure and refusal:** a provider failure or `none` still returns the
  figures, and credential and illegal requests are refused.

## Limitations

- **Keyword routing** can miss unusual phrasings. These fall back to the
  overview, which always answers with real figures.
- **Counts are not checked.** The figure check covers amounts and
  percentages, so "19 orders" is not verified.
- **Merchant and category names are not checked** against the context. The
  prompt forbids inventing them, and the shown facts are always correct.
- **The brief cache is per API process.** A restart rewrites briefs on next
  view.
