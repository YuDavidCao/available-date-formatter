// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://yudavidcao.github.io',
  base: '/available-date-formatter/',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
})
