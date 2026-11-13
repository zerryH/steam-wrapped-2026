import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Actions builds the project site at /steam-wrapped-2026/.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/steam-wrapped-2026/' : '/',
});
