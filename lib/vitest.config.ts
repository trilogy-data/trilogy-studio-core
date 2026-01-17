import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load env from both current directory and parent directory, merging them
  const parentEnv = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const localEnv = loadEnv(mode, __dirname, '')

  return {
    plugins: [vue()],
    test: {
      environment: 'jsdom',
      env: {
        ...parentEnv,
        ...localEnv,
      },
    },
  }
})
