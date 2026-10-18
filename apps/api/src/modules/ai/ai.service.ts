import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { assistantContext } from '@moneylens/analytics';
import type {
  AssistantAnswer,
  AssistantContext,
  AssistantConversation,
  AssistantConversationSummary,
  AssistantMessage,
  AssistantStatus,
  CategorySuggestions,
  ChatResponse,
  MoneyBrief,
  ReportStatement,
} from '@moneylens/types';
import type { ChatInput } from '@moneylens/validation';
import { formatMonthKey } from '@moneylens/shared';
import { visibleCategoryWhere } from '../../lib/categories';
import { AppError, notFound } from '../../lib/errors';
import type { InsightsService } from '../insights/insights.service';
import type { PlanService } from '../plan/plan.service';
import {
  MAX_SUGGEST_ITEMS,
  SUGGEST_SYSTEM_PROMPT,
  parseSuggestions,
  suggestPrompt,
  type SuggestCategory,
  type SuggestItem,
} from './category-suggest';
import { factsFor } from './facts';
import { allowedNumbers, checkGrounding, screenInput } from './guardrails';
import { classifyQuestion, mentionedMonth } from './intent';
import {
  BRIEF_INSTRUCTION,
  SYSTEM_PROMPT,
  contextFor,
  correctionTurn,
  questionTurn,
} from './prompt';
import { NoProvider, type AIProvider } from './providers';

export const NOTES = {
  notConfigured:
    "MoneyLens AI isn't turned on for your account, so there is no written explanation. Here are the calculated figures for your question.",
  fallback:
    "I couldn't write an explanation that sticks to your calculated figures, so here are the figures themselves.",
  unavailable:
    "MoneyLens AI couldn't be reached just now. Here are the calculated figures for your question; try again later for an explanation.",
} as const;

/** Earlier turns sent with a follow-up question. */
const HISTORY_MESSAGES = 6;
const BRIEF_TTL_MS = 12 * 60 * 60_000;
const BRIEF_CACHE_MAX = 1000;

export interface AIServiceOptions {
  maxOutputTokens: number;
  dailyMessageLimit: number;
  /** Lowercased emails that may use the provider; empty means every account. */
  allowedEmails?: readonly string[];
}

const NO_PROVIDER = new NoProvider();

type Turn = { role: 'user' | 'assistant'; content: string };

interface Explanation {
  status: AssistantAnswer['status'];
  interpretation: string | null;
  regenerated: boolean;
}

function providerLabel(provider: AIProvider): string | null {
  if (!provider.configured) return null;
  return provider.model ? `${provider.name}/${provider.model}` : provider.name;
}

/**
 * MoneyLens AI. Figures come from the analytics engine; the model only
 * explains them, and every amount or percentage it writes is checked against
 * those figures before it is shown.
 */
export class AIService {
  private readonly briefs = new Map<string, { brief: MoneyBrief; expires: number }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly insights: InsightsService,
    private readonly plans: PlanService,
    private readonly provider: AIProvider,
    private readonly options: AIServiceOptions,
    private readonly logger: Logger,
  ) {}

  /**
   * The provider this user may use. Accounts outside AI_ALLOWED_EMAILS get
   * calculated figures only, so nothing of theirs reaches the provider and
   * they do not spend the server owner's AI key.
   */
  private async providerFor(userId: string): Promise<AIProvider> {
    const allowed = this.options.allowedEmails ?? [];
    if (!this.provider.configured || allowed.length === 0) return this.provider;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user && allowed.includes(user.email.toLowerCase()) ? this.provider : NO_PROVIDER;
  }

  async status(userId: string): Promise<AssistantStatus> {
    const provider = await this.providerFor(userId);
    return {
      configured: provider.configured,
      provider: provider.name,
      model: provider.model,
      dailyMessageLimit: this.options.dailyMessageLimit,
      messagesToday: await this.messagesToday(userId),
      availableMonths: await this.insights.availableMonths(userId),
    };
  }

  private messagesToday(userId: string): Promise<number> {
    return this.prisma.aIMessage.count({
      where: {
        role: 'USER',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
        conversation: { userId },
      },
    });
  }

  /** The analytics context for a month, including the saved money plan. */
  async context(userId: string, month?: string): Promise<AssistantContext> {
    const [ctx, plan] = await Promise.all([
      this.insights.context(userId, month),
      this.plans.get(userId),
    ]);
    return assistantContext({ ...ctx, plan: plan.profile ? plan.plan : null });
  }

  /**
   * Ask the provider, check every figure in the answer, and ask once more
   * with the problems listed if the check fails.
   */
  private async explain(
    provider: AIProvider,
    history: Turn[],
    turn: string,
    ctx: AssistantContext,
    extraText: string,
    facts: ReportStatement[],
  ): Promise<Explanation> {
    if (!provider.configured) {
      return { status: 'not-configured', interpretation: null, regenerated: false };
    }
    const allowed = allowedNumbers(ctx, extraText, ...facts.map((f) => f.text));
    const messages: Turn[] = [...history, { role: 'user', content: turn }];
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { text } = await provider.complete({
          system: SYSTEM_PROMPT,
          messages,
          maxTokens: this.options.maxOutputTokens,
        });
        const check = checkGrounding(text, allowed);
        if (check.ok) return { status: 'answered', interpretation: text, regenerated: attempt > 0 };
        this.logger.warn(
          { unsupported: check.unsupported, violations: check.violations, attempt },
          'MoneyLens AI answer failed the figure check',
        );
        messages.push(
          { role: 'assistant', content: text },
          { role: 'user', content: correctionTurn(check.unsupported, check.violations) },
        );
      }
      return { status: 'fallback', interpretation: null, regenerated: true };
    } catch (err) {
      this.logger.error({ err: err instanceof Error ? err.message : err }, 'AI provider failed');
      return { status: 'unavailable', interpretation: null, regenerated: false };
    }
  }

  async chat(userId: string, input: ChatInput): Promise<ChatResponse> {
    if ((await this.messagesToday(userId)) >= this.options.dailyMessageLimit) {
      throw new AppError(
        'RATE_LIMITED',
        `You have asked ${this.options.dailyMessageLimit} questions in the last 24 hours, which is the limit. Please try again later.`,
      );
    }
    const conversation = input.conversationId
      ? await this.prisma.aIConversation.findFirst({ where: { id: input.conversationId, userId } })
      : null;
    if (input.conversationId && !conversation) throw notFound('Conversation not found');

    const screened = screenInput(input.message);
    const question = screened.action === 'allow' ? screened.text : screened.storedText;
    const conv =
      conversation ??
      (await this.prisma.aIConversation.create({
        data: { userId, title: titleFrom(question) },
      }));

    let answer: AssistantAnswer;
    let content: string;
    if (screened.action === 'refuse') {
      answer = {
        status: 'refused',
        month: input.month ?? '',
        topics: [],
        facts: [],
        interpretation: null,
        dataLimitations: [],
        provider: null,
        regenerated: false,
      };
      content = screened.reply;
    } else {
      // A month named in the question wins over the page's month picker.
      const named = mentionedMonth(question, await this.insights.availableMonths(userId));
      const ctx = await this.context(userId, named.month ?? input.month);
      const noData = named.missing.map(
        (m) =>
          `I have no transaction data for ${m}, so this answer is about ${formatMonthKey(ctx.month)}.`,
      );
      const { topics, facts } = factsFor(classifyQuestion(question), ctx, question);
      const history = await this.history(conv.id);
      const turn = questionTurn(question, contextFor(ctx, topics), facts);
      const provider = await this.providerFor(userId);
      const result = await this.explain(provider, history, turn, ctx, question, facts);
      answer = {
        status: result.status,
        month: ctx.month,
        topics,
        facts,
        interpretation: result.interpretation,
        dataLimitations: [...noData, ...ctx.dataLimitations],
        provider: result.interpretation ? providerLabel(provider) : null,
        regenerated: result.regenerated,
      };
      content =
        result.interpretation ??
        (result.status === 'not-configured'
          ? NOTES.notConfigured
          : result.status === 'fallback'
            ? NOTES.fallback
            : NOTES.unavailable);
    }

    const [questionRow, replyRow] = await this.prisma.$transaction(async (tx) => {
      const q = await tx.aIMessage.create({
        data: { conversationId: conv.id, role: 'USER', content: question },
      });
      const r = await tx.aIMessage.create({
        data: {
          conversationId: conv.id,
          role: 'ASSISTANT',
          content,
          provider: answer.provider,
          contextRef: answer as unknown as Prisma.InputJsonValue,
          // Keep the reply strictly after the question when both land in one millisecond.
          createdAt: new Date(q.createdAt.getTime() + 1),
        },
      });
      await tx.aIConversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
      return [q, r];
    });

    return {
      conversation: summary({ ...conv, updatedAt: new Date() }),
      question: toMessage(questionRow),
      reply: toMessage(replyRow),
    };
  }

  /** Earlier questions and answers, so follow-ups make sense. */
  private async history(conversationId: string): Promise<Turn[]> {
    const rows = await this.prisma.aIMessage.findMany({
      where: { conversationId, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_MESSAGES,
    });
    const turns: Turn[] = rows
      .reverse()
      .map((m) => ({ role: m.role === 'USER' ? 'user' : 'assistant', content: m.content }));
    // Providers expect the conversation to start with the user.
    while (turns[0]?.role === 'assistant') turns.shift();
    return turns;
  }

  async conversations(userId: string): Promise<AssistantConversationSummary[]> {
    const rows = await this.prisma.aIConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return rows.map(summary);
  }

  async conversation(userId: string, id: string): Promise<AssistantConversation> {
    const conv = await this.prisma.aIConversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) throw notFound('Conversation not found');
    return { ...summary(conv), messages: conv.messages.map(toMessage) };
  }

  async deleteConversation(userId: string, id: string): Promise<{ deleted: true }> {
    const { count } = await this.prisma.aIConversation.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound('Conversation not found');
    return { deleted: true };
  }

  async deleteAllConversations(userId: string): Promise<{ deleted: number }> {
    const { count } = await this.prisma.aIConversation.deleteMany({ where: { userId } });
    for (const key of this.briefs.keys()) if (key.startsWith(`${userId}:`)) this.briefs.delete(key);
    return { deleted: count };
  }

  /**
   * The AI Money Brief for the dashboard. It is cached per user, month and
   * figures, so it is only rewritten when the underlying numbers change.
   */
  /**
   * Suggest categories for the merchants in an import that have none. Only
   * merchant names, the direction and one masked statement line are sent:
   * no amounts, dates, account numbers or UPI IDs. Nothing is saved; the
   * user applies the suggestions they agree with.
   */
  async suggestCategories(userId: string, importId: string): Promise<CategorySuggestions> {
    const record = await this.prisma.import.findFirst({
      where: { id: importId, userId },
      select: { id: true },
    });
    if (!record) throw notFound('Import not found');

    const provider = await this.providerFor(userId);
    if (!provider.configured) {
      return {
        status: 'not-configured',
        suggestions: [],
        message: "MoneyLens AI isn't turned on for your account.",
      };
    }

    const rows = await this.prisma.importTransaction.findMany({
      where: { importId, categoryId: null, decision: 'INCLUDE' },
      select: { merchantName: true, rawDescription: true, flow: true },
      orderBy: { rowIndex: 'asc' },
    });
    const groups = new Map<string, SuggestItem & { count: number }>();
    for (const row of rows) {
      const merchant = row.merchantName ?? 'Unknown';
      const group = groups.get(merchant) ?? {
        merchant,
        flow: row.flow,
        sample: row.rawDescription,
        count: 0,
      };
      group.count += 1;
      groups.set(merchant, group);
    }
    const items: SuggestItem[] = [...groups.values()]
      .filter((g) => g.merchant !== 'Unknown')
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_SUGGEST_ITEMS)
      .map(({ merchant, flow, sample }) => ({ merchant, flow, sample }));
    if (items.length === 0) return { status: 'ok', suggestions: [], message: null };

    const categories = await this.suggestCategoryList(userId);
    try {
      const { text } = await provider.complete({
        system: SUGGEST_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: suggestPrompt(items, categories) }],
        maxTokens: Math.max(this.options.maxOutputTokens, 20 * items.length + 100),
      });
      const suggestions = parseSuggestions(text, items, categories);
      return {
        status: 'ok',
        suggestions,
        message: suggestions.length === 0 ? 'MoneyLens AI had no confident suggestions.' : null,
      };
    } catch (err) {
      this.logger.error({ err: err instanceof Error ? err.message : err }, 'AI provider failed');
      return {
        status: 'unavailable',
        suggestions: [],
        message: "MoneyLens AI couldn't be reached just now. Try again in a minute.",
      };
    }
  }

  /** Categories with no subcategories under them, keyed "parent/child". */
  private async suggestCategoryList(userId: string): Promise<SuggestCategory[]> {
    const rows = await this.prisma.category.findMany({
      where: visibleCategoryWhere(userId),
      select: { id: true, name: true, slug: true, parentId: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const parents = new Set(rows.map((r) => r.parentId).filter(Boolean));
    const used = new Set<string>();
    const out: SuggestCategory[] = [];
    for (const row of rows) {
      if (parents.has(row.id)) continue;
      const parent = row.parentId ? byId.get(row.parentId) : undefined;
      let key = parent ? `${parent.slug}/${row.slug}` : row.slug;
      for (let n = 2; used.has(key); n++)
        key = `${parent ? `${parent.slug}/` : ''}${row.slug}-${n}`;
      used.add(key);
      out.push({ key, label: parent ? `${parent.name}: ${row.name}` : row.name, id: row.id });
    }
    return out;
  }

  async brief(userId: string, month?: string): Promise<MoneyBrief> {
    const ctx = await this.context(userId, month);
    const { facts } = factsFor(['overview', 'change', 'savings', 'recurring'], ctx, '');
    const briefFacts = pickBriefFacts(facts);
    const hash = createHash('sha256').update(JSON.stringify(briefFacts)).digest('hex').slice(0, 16);
    const provider = await this.providerFor(userId);
    const key = `${userId}:${ctx.month}:${hash}:${provider.name}`;
    const cached = this.briefs.get(key);
    if (cached && cached.expires > Date.now()) return cached.brief;

    const generatedAt = new Date().toISOString();
    let brief: MoneyBrief;
    if (briefFacts.length === 0) {
      brief = {
        month: ctx.month,
        status: 'answered',
        facts: [],
        text: null,
        provider: null,
        generatedAt,
      };
    } else {
      const turn = questionTurn(
        BRIEF_INSTRUCTION,
        contextFor(ctx, ['overview', 'change', 'savings']),
        briefFacts,
      );
      const result = await this.explain(provider, [], turn, ctx, '', briefFacts);
      brief = {
        month: ctx.month,
        status: result.status,
        facts: briefFacts,
        text: result.interpretation,
        provider: result.interpretation ? providerLabel(provider) : null,
        generatedAt,
      };
    }
    // Do not cache a failure; the next visit tries again.
    if (brief.status !== 'unavailable') {
      if (this.briefs.size >= BRIEF_CACHE_MAX) {
        const oldest = this.briefs.keys().next().value;
        if (oldest) this.briefs.delete(oldest);
      }
      this.briefs.set(key, { brief, expires: Date.now() + BRIEF_TTL_MS });
    }
    return brief;
  }
}

/** The overview, the headline change and the largest opportunity: at most five lines. */
function pickBriefFacts(facts: ReportStatement[]): ReportStatement[] {
  const out = facts.filter(
    (f) =>
      f.text.startsWith('In ') ||
      f.text.startsWith('Your largest categories') ||
      f.text.startsWith('Spending was') ||
      f.text.startsWith('Potential saving opportunity') ||
      f.text.startsWith('Active recurring payments'),
  );
  const firstOpportunity = out.findIndex((f) => f.text.startsWith('Potential saving opportunity'));
  return out.filter(
    (f, i) => !f.text.startsWith('Potential saving opportunity') || i === firstOpportunity,
  );
}

function titleFrom(question: string): string {
  const t = question.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

function summary(c: { id: string; title: string | null; createdAt: Date; updatedAt: Date }) {
  return {
    id: c.id,
    title: c.title ?? 'Conversation',
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toMessage(m: {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  contextRef: Prisma.JsonValue | null;
}): AssistantMessage {
  return {
    id: m.id,
    role: m.role === 'USER' ? 'user' : 'assistant',
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    answer:
      m.role === 'ASSISTANT' && m.contextRef ? (m.contextRef as unknown as AssistantAnswer) : null,
  };
}
