import { defineConfig } from 'tsup';

// Workspace packages are TypeScript sources, so they are bundled into the API
// output. Third-party dependencies stay external and are installed at runtime.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@moneylens\//],
});
