import { defineConfig } from 'vite';

// Preview page only (npm run preview): runs the module against the live
// sources. ZenQuotes doesn't allow browser requests, so both go through this
// server, standing in for the host's proxy.
export default defineConfig({
  root: __dirname,
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
  server: {
    port: 5181,
    proxy: {
      '/src-joke': { target: 'https://icanhazdadjoke.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/src-joke/, '') },
      '/src-quote': { target: 'https://zenquotes.io', changeOrigin: true, rewrite: (p) => p.replace(/^\/src-quote/, '') },
    },
  },
});
