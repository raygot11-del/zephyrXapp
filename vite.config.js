import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: {
        Buffer: true,
      },
    }),
  ],
  define: {
    global: 'globalThis',
  },
  esbuild: {
    loader: 'js',
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  server: {
    hmr: {
      overlay: false,
    },
  },
});
