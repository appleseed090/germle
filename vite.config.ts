import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        daily: 'index.html',
      },
    },
  },
});
