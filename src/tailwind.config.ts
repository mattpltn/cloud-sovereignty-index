import type { Config } from 'tailwindcss';

export default {
  content: ['./**/*.{astro,html,js,jsx,md,mdx,ts,tsx}', '!./node_modules/**'],
  theme: {
    extend: {
      colors: {
        seal: {
          0: '#dc2626',
          1: '#f97316',
          2: '#eab308',
          3: '#22c55e',
          4: '#16a34a',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
