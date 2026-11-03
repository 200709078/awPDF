import { defineConfig } from '@playwright/test'
import base from '../../playwright.config'

// Mağaza görselleri için ayrı yapılandırma; `npm test` bu klasöre bakmaz.
export default defineConfig({
  ...base,
  testDir: '.',
  fullyParallel: false,
  workers: 1,
})
