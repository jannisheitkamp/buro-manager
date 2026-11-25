import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Unit-Tests für reine Logik (Provision, Storno, Fristen, Import); E2E läuft über Playwright in tests/e2e
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
