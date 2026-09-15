import { defineConfig } from 'vite';

export default defineConfig({
  // Relative output lets the same build run on localhost and under a GitHub
  // Pages repository path such as /ege-kacamagi-tycoon/.
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022', rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
