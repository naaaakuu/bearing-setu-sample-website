// Starts the web server. This is the ONLY file that opens a network port.
//   node server/index.mjs
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/env.mjs';

loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));

const { createApp } = await import('./app.mjs');

let app;
try {
  app = createApp({ env: process.env });
  await app.ready();
} catch (e) {
  console.error(`\nCannot start: ${e.message}\n`);
  process.exit(1);
}

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1');

const server = http.createServer((req, res) => {
  app.handle(req, res).catch((e) => {
    console.error(`[error] ${req.method} ${String(req.url).split('?')[0]}: ${e && e.message}`);
    res.destroy();
  });
});
process.on('unhandledRejection', (e) => console.error('[error] unhandled rejection:', e && e.message));
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;

server.listen(port, host, () => {
  const env = process.env;
  console.log(`Bearingsetu server listening on http://${host}:${port}`);
  console.log(`  Admin panel : http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/admin/ (${env.ADMIN_EMAIL && env.ADMIN_PASSWORD ? 'login enabled' : 'DISABLED: set ADMIN_EMAIL and ADMIN_PASSWORD'})`);
  console.log(`  Email       : ${env.SMTP_HOST ? `SMTP via ${env.SMTP_HOST}` : 'SMTP not set: emails are saved as files in the outbox folder'}`);
  console.log(`  CORS origins: ${env.CORS_ORIGINS || '(none: browsers on other sites are blocked)'}`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} received, finishing up...`);
  server.close();
  try { await app.idle(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
