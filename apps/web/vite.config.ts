import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The crypto WASM package sits under matrix-js-sdk (pnpm), out of reach of a bare import from here.
const sdk = createRequire(import.meta.url).resolve('matrix-js-sdk');
const cryptoWasm = dirname(createRequire(sdk).resolve('@matrix-org/matrix-sdk-crypto-wasm'));

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:8008', ws: true } } },
  resolve: { alias: { '@matrix-org/matrix-sdk-crypto-wasm': join(cryptoWasm, 'index.mjs') } },
  // Pre-bundling moves the crypto module away from its .wasm file (loaded via new URL(…, import.meta.url)).
  optimizeDeps: { exclude: ['@matrix-org/matrix-sdk-crypto-wasm'] },
  // First-load dependencies get their own chunks, so a deploy that only changes our code keeps them cached.
  // `$initial` leaves lazily loaded code (TipTap, emoji data, the SDK's crypto) in its own chunks.
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'matrix', test: /[\\/]node_modules[\\/](matrix-js-sdk|matrix-widget-api|matrix-events-sdk)[\\/]/, tags: ['$initial'], priority: 1 },
            { name: 'vendor', test: /[\\/]node_modules[\\/]/, tags: ['$initial'] },
          ],
        },
      },
    },
  },
});
