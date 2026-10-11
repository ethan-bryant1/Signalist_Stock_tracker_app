import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for the app's pure logic (market-data rules, heatmap layout, colors, view state).
// The pages themselves are checked in a real browser instead (see docs/heatmap.md).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
