import { defineConfig } from 'vitest/config'

export default defineConfig({
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
