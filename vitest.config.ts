import { defineConfig } from 'vitest/config'

// Testes da lógica pura (renderer/src/lib e main/assets), sem Electron nem navegador.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
