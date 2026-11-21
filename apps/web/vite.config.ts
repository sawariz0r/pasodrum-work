import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The crypto WASM package sits under matrix-js-sdk (pnpm), out of reach of a bare import from here.
const sdk = createRequire(import.meta.url).resolve('matrix-js-sdk');
const cryptoWasm = dirname(createRequire(sdk).resolve('@matrix-org/matrix-sdk-crypto-wasm'));

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8008' } },
  resolve: { alias: { '@matrix-org/matrix-sdk-crypto-wasm': join(cryptoWasm, 'index.mjs') } },
  // Pre-bundling moves the crypto module away from its .wasm file (loaded via new URL(…, import.meta.url)).
  optimizeDeps: { exclude: ['@matrix-org/matrix-sdk-crypto-wasm'] },
});
