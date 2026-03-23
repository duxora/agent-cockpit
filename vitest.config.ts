import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/**/__tests__/*.test.ts',
      'src/**/__tests__/*.test.tsx',
      'server/**/__tests__/*.test.ts',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx'
    ],
    setupFiles: ['src/components/__tests__/setup.ts'],
    testTimeout: 10000,
  },
})
