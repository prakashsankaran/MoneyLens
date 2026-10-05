import { screen } from '@testing-library/react';
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
});
