import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@voltcraft/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/db/seed.ts'],
    },
  },
})
