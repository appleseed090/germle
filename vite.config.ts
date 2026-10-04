import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/shared-[hash].js',
      },
      input: {
        daily: 'index.html',
        about: 'about.html',
        practice: 'practice.html',
      },
    },
  },
});
