import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts'],
  format: ['esm'],
  dts: true,
  bundle: true,      // ✅ bundle runtime deps (zod)
  external: [],      // include all deps
  outDir: 'dist'
})