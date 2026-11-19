import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Content Security Policy for production builds, injected as a <meta> tag so it works on any host.
 * Everything is self-hosted; the only allowed remote origin is your Supabase project (API + Realtime),
 * read from VITE_SUPABASE_URL at build time. 'unsafe-inline' is allowed for styles only (React style
 * attributes). The dev server is left alone because Vite's hot reload injects inline scripts.
 */
function buildCsp(supabaseUrl?: string) {
  let api = '';
  if (supabaseUrl) {
    const u = new URL(supabaseUrl); // throws on a malformed URL, so a typo fails the build instead of the app
    api = ` ${u.origin} wss://${u.host}`;
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src 'self'${api}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const cspPlugin = (csp: string): Plugin => ({
  name: 'irondesk-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
});

// base: './' + HashRouter = deployable to GitHub Pages / any static host
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    plugins: [react(), tailwindcss(), cspPlugin(buildCsp(env.VITE_SUPABASE_URL))],
    build: { sourcemap: false },
  };
});
