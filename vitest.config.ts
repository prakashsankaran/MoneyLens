import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'packages',
          include: ['packages/*/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      'apps/api/vitest.config.ts',
      'apps/web/vite.config.ts',
    ],
  },
});
