import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const explicitAllowedHosts = ['dicer-roller.onrender.com'];
const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME;
if (renderHost) {
  explicitAllowedHosts.push(renderHost);
}

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: explicitAllowedHosts
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  }
});
