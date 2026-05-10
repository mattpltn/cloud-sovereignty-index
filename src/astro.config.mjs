import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CF_PAGES=1 is set automatically by Cloudflare Pages build environment
const isCloudflare = process.env.CF_PAGES === '1';

let adapter;
if (isCloudflare) {
  const { default: cloudflare } = await import('@astrojs/cloudflare');
  adapter = cloudflare({ imageService: 'passthrough' });
} else {
  const { default: node } = await import('@astrojs/node');
  adapter = node({ mode: 'standalone' });
}

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'server',
  adapter,
  srcDir: '.',
  publicDir: '../public',
  vite: {
    // Proxy /api to local Workers only during local dev
    server: isCloudflare ? undefined : {
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../shared/src'),
      },
    },
    // exceljs uses Node.js Buffer/stream — keep it browser-side only
    ssr: {
      external: ['exceljs'],
    },
  },
});
