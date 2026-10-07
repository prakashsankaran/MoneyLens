import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatFixture, statusFixture } from '../../test/fixtures-phase6';
import { mockApi, renderRoute } from '../../test/render';
import { AssistantPage } from './AssistantPage';

afterEach(() => vi.unstubAllGlobals());

describe('AssistantPage', () => {
  it('asks an example question and keeps the AI text apart from the figures', async () => {
    const calls = mockApi(({ url, method }) => {
      if (url.endsWith('/ai/status')) return { data: statusFixture };
      if (url.endsWith('/ai/conversations')) return { data: [] };
      if (url.endsWith('/ai/chat') && method === 'POST') return { data: chatFixture };
      return undefined;
    });
    renderRoute(<AssistantPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Where did most of my money go?' }),
    );

    const reply = await screen.findByRole('listitem', { name: 'MoneyLens AI reply' });
    const answer = within(reply).getByRole('region', { name: 'MoneyLens AI answer' });
    expect(within(answer).getByText('AI interpretation')).toBeInTheDocument();
    expect(within(answer).getByText('Housing took the most, at ₹32,000.')).toBeInTheDocument();
    expect(within(reply).getByText('Calculated')).toBeInTheDocument();
    expect(
      within(reply).getByText('Housing: ₹32,000, 31% of spending, 1 payment.'),
    ).toBeInTheDocument();
    expect(within(reply).getByText(/only 2 earlier months/)).toBeInTheDocument();
    expect(within(reply).getByText(/checked against your calculated figures/)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/ai/chat'))?.body).toEqual({
      message: 'Where did most of my money go?',
    });
    expect(screen.getByText(/3 of 50 questions used/)).toBeInTheDocument();
  });

  it('continues the conversation with a typed follow-up', async () => {
    const calls = mockApi(({ url }) => {
      if (url.endsWith('/ai/status')) return { data: statusFixture };
      if (url.endsWith('/ai/conversations')) return { data: [chatFixture.conversation] };
      if (url.endsWith('/ai/chat')) return { data: chatFixture };
      return undefined;
    });
    renderRoute(<AssistantPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'What are my top 5 merchants?' }),
    );
    await screen.findByRole('listitem', { name: 'MoneyLens AI reply' });
    await userEvent.type(screen.getByLabelText('Ask MoneyLens AI'), 'And last month?{Enter}');
    const chats = calls.filter((c) => c.url.endsWith('/ai/chat'));
    expect(chats[1]?.body).toEqual({ message: 'And last month?', conversationId: 'c1' });
  });

  it('says plainly when AI is not set up and shows the figures instead', async () => {
    mockApi(({ url }) => {
      if (url.endsWith('/ai/status'))
        return { data: { ...statusFixture, configured: false, provider: 'none', model: null } };
      if (url.endsWith('/ai/conversations')) return { data: [] };
      if (url.endsWith('/ai/chat')) {
        return {
          data: {
            ...chatFixture,
            reply: {
              ...chatFixture.reply,
              content: "MoneyLens AI isn't set up on this server yet.",
              answer: {
                ...chatFixture.reply.answer,
                status: 'not-configured',
                interpretation: null,
                provider: null,
              },
            },
          },
        };
      }
      return undefined;
    });
    renderRoute(<AssistantPage />);
    expect(await screen.findByText(/not set up on this server yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Where did most of my money go?' }));
    const reply = await screen.findByRole('listitem', { name: 'MoneyLens AI reply' });
    expect(within(reply).queryByText('AI interpretation')).not.toBeInTheDocument();
    expect(within(reply).getByText(/only the calculated figures are shown/)).toBeInTheDocument();
    expect(within(reply).getByText('Housing: ₹32,000, 31% of spending, 1 payment.')).toBeVisible();
  });

  it('shows a refusal as plain text', async () => {
    mockApi(({ url }) => {
      if (url.endsWith('/ai/status')) return { data: statusFixture };
      if (url.endsWith('/ai/conversations')) return { data: [] };
      if (url.endsWith('/ai/chat')) {
        return {
          data: {
            ...chatFixture,
            reply: {
              ...chatFixture.reply,
              content: "Please don't share PINs, passwords, OTPs, CVVs or card numbers here.",
              answer: {
                ...chatFixture.reply.answer,
                status: 'refused',
                facts: [],
                interpretation: null,
              },
            },
          },
        };
      }
      return undefined;
    });
    renderRoute(<AssistantPage />);
    await userEvent.type(await screen.findByLabelText('Ask MoneyLens AI'), 'my pin is 1234{Enter}');
    expect(await screen.findByText(/don't share PINs/)).toBeInTheDocument();
  });

  it('asks about the month picked on the page and labels the answer with its month', async () => {
    const calls = mockApi(({ url, method }) => {
      if (url.endsWith('/ai/status')) return { data: statusFixture };
      if (url.endsWith('/ai/conversations')) return { data: [] };
      if (url.endsWith('/ai/chat') && method === 'POST') return { data: chatFixture };
      return undefined;
    });
    renderRoute(<AssistantPage />);
    const picker = await screen.findByLabelText(/Answer about/);
    expect(
      within(picker).getByRole('option', { name: 'Latest month (September 2026)' }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(picker, 'August 2026');
    await userEvent.type(screen.getByLabelText('Ask MoneyLens AI'), 'Where did it go?{Enter}');

    const reply = await screen.findByRole('listitem', { name: 'MoneyLens AI reply' });
    expect(within(reply).getByText('About September 2026')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/ai/chat'))?.body).toEqual({
      message: 'Where did it go?',
      month: '2026-08',
    });
  });
});
