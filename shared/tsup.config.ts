import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts', 'content.ts'],
  format: ['esm'],
  dts: true,
  bundle: true,      // ✅ bundle runtime deps (zod)
  external: ['express', 'express-async-errors', 'cors', 'mongoose'], // content.ts kit deps stay external
  outDir: 'dist'
})