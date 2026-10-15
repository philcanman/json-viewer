import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { devtools: path.resolve('vendor/gecko/devtools') },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
