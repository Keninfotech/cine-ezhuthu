import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // relative base so the build works from any folder or static host
  base: './',
  test: { include: ['src/**/*.test.ts'] },
})
