import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importReview } from '../../test/fixtures-phase2';
import { mockApi, renderRoute } from '../../test/render';
import { ImportsPage } from './ImportsPage';

afterEach(() => vi.unstubAllGlobals());

describe('ImportsPage', () => {
  it('uploads the chosen file as multipart and opens the review', async () => {
    const calls = mockApi(({ method, url }) => {
      if (method === 'POST' && url.endsWith('/imports')) return { status: 201, data: importReview };
      if (url.endsWith('/imports')) return { data: [] };
      return undefined;
    });
    renderRoute(<ImportsPage />, { url: '/imports', path: '/imports' });
    expect(await screen.findByText('No statements imported yet.')).toBeInTheDocument();

    const file = new File(['Date,Description,Amount\n'], 'bank.csv', { type: 'text/csv' });
    await userEvent.upload(screen.getByLabelText(/Choose file/), file);

    expect(await screen.findByText('Navigated away')).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/imports'));
    expect(post?.body).toBeInstanceOf(FormData);
    expect((post?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('links to the earlier import when the same file is uploaded again', async () => {
    mockApi(({ method, url }) => {
      if (method === 'POST') {
        return {
          status: 409,
          error: {
            code: 'CONFLICT',
            message: 'This exact file has already been imported.',
            details: { importId: 'imp1' },
          },
        };
      }
      if (url.endsWith('/imports')) return { data: [importReview.import] };
      return undefined;
    });
    renderRoute(<ImportsPage />, { url: '/imports', path: '/imports' });
    await screen.findByText('hdfc.csv');
    await userEvent.upload(
      screen.getByLabelText(/Choose file/),
      new File(['x'], 'bank.csv', { type: 'text/csv' }),
    );
    expect(await screen.findByText(/already been imported/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/imports/imp1');
  });

  it('asks for the password of a protected PDF and sends it with the file', async () => {
    const calls = mockApi(({ method, url, body }) => {
      if (method === 'POST' && url.endsWith('/imports')) {
        const password = (body as FormData).get('password');
        if (password === 'ASHA0101') return { status: 201, data: importReview };
        return {
          status: 400,
          error: {
            code: 'VALIDATION_ERROR',
            message: password ? 'That password did not open the PDF.' : 'Password protected.',
            details: { reason: password ? 'PASSWORD_INCORRECT' : 'PASSWORD_REQUIRED' },
          },
        };
      }
      if (url.endsWith('/imports')) return { data: [] };
      return undefined;
    });
    renderRoute(<ImportsPage />, { url: '/imports', path: '/imports' });
    await screen.findByText('No statements imported yet.');
    await userEvent.upload(
      screen.getByLabelText(/Choose file/),
      new File(['%PDF-'], 'gpay.pdf', { type: 'application/pdf' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'This PDF is password protected' });
    await userEvent.type(within(dialog).getByLabelText('PDF password'), 'wrong');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Open PDF' }));
    expect(await screen.findByText(/That password did not open the PDF/)).toBeInTheDocument();

    const again = screen.getByRole('dialog');
    await userEvent.type(within(again).getByLabelText('PDF password'), 'ASHA0101');
    await userEvent.click(within(again).getByRole('button', { name: 'Open PDF' }));
    expect(await screen.findByText('Navigated away')).toBeInTheDocument();
    const posts = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/imports'));
    expect(posts).toHaveLength(3);
    expect((posts[2]?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('lets the user choose columns when headings are not recognised', async () => {
    const calls = mockApi(({ method, url, body }) => {
      if (method === 'POST' && url.endsWith('/imports')) {
        if ((body as FormData).get('mapping')) return { status: 201, data: importReview };
        return {
          status: 400,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Could not find the column headings.',
            details: {
              reason: 'COLUMNS_NOT_FOUND',
              preview: [
                ['Account 1234'],
                ['When', 'What', 'How much'],
                ['2026-09-01', 'Swiggy order', '-452'],
              ],
            },
          },
        };
      }
      if (url.endsWith('/imports')) return { data: [] };
      return undefined;
    });
    renderRoute(<ImportsPage />, { url: '/imports', path: '/imports' });
    await screen.findByText('No statements imported yet.');
    await userEvent.upload(
      screen.getByLabelText(/Choose file/),
      new File(['x'], 'mine.xlsx', { type: '' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Choose the columns' });
    expect(within(dialog).getByText('Swiggy order')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Read file' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose the date column.');

    await userEvent.selectOptions(within(dialog).getByLabelText('Headings are in row'), '1');
    await userEvent.selectOptions(within(dialog).getByLabelText('Date'), 'A: When');
    await userEvent.selectOptions(within(dialog).getByLabelText('Description'), 'B: What');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Amount/), 'C: How much');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Read file' }));

    expect(await screen.findByText('Navigated away')).toBeInTheDocument();
    const post = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/imports'))[1];
    expect(JSON.parse((post?.body as FormData).get('mapping') as string)).toEqual({
      headerRow: 1,
      columns: { date: 0, description: 1, amount: 2 },
    });
  });
});
