// Command line helper:
//   node server/cli.mjs init            create the data folder and files, print the next steps
//   node server/cli.mjs hash-password   make a hashed admin password for ADMIN_PASSWORD
//   node server/cli.mjs demo            OPTIONAL fake data for local development only
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadEnvFile } from './lib/env.mjs';
import { Store } from './lib/store.mjs';
import { hashPassword, MIN_PASSWORD } from './lib/auth.mjs';
import { createCatalogLoader } from './lib/catalog.mjs';
import { newId } from './lib/util.mjs';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const exists = (p) => access(p).then(() => true, () => false);

const dataDirOf = (env) => path.resolve(SERVER_DIR, env.DATA_DIR || './data');

async function init({ env, out }) {
  const dir = dataDirOf(env);
  await new Store(dir).init();
  out(`Data folder ready: ${dir}`);
  out('It starts EMPTY: no accounts, no prices. Back this folder up regularly (see server/README.md).');

  const envFile = env.BS_ENV_FILE || path.join(SERVER_DIR, '.env');
  if (!(await exists(envFile))) {
    const text = (await readFile(path.join(SERVER_DIR, '.env.example'), 'utf8')).replace(/^SECRET=.*$/m, `SECRET=${randomBytes(48).toString('base64url')}`);
    await writeFile(envFile, text, { mode: 0o600, flag: 'wx' }); // 'wx': never overwrite an existing file
    out(`Created ${envFile} with a new random SECRET. Open it and fill in the rest.`);
  } else {
    out(`${envFile} already exists, left unchanged.`);
  }

  out('\nNext steps:');
  out('  1. Choose a password (10+ characters) and make its hash:   node server/cli.mjs hash-password');
  out('  2. In server/.env set ADMIN_EMAIL and ADMIN_PASSWORD (paste the hash), and CORS_ORIGINS (your storefront address).');
  out('  3. Optional: fill in the SMTP_* lines so customers receive emails.');
  out('  4. Start the server:                                       node server/index.mjs');
  out('  5. Open /admin/ in your browser, log in, and fill in Settings first.');
  out('  6. In assets/js/config.js of the storefront set apiBase to your server address.');
  return 0;
}

async function hashPasswordCommand({ io, out, err }) {
  const first = await io.prompt('New admin password (not shown): ', true);
  if (first.length < MIN_PASSWORD) { err(`The password must be at least ${MIN_PASSWORD} characters.`); return 1; }
  if (io.interactive) {
    const second = await io.prompt('Type it again: ', true);
    if (second !== first) { err('The two passwords do not match.'); return 1; }
  }
  out('\nPut this line in server/.env (it is a hash, not your password):\n');
  out(`ADMIN_PASSWORD=${await hashPassword(first)}`);
  return 0;
}

// ---- DEMO data (local development only) ------------------------------------
async function demo({ env, argv, out, err }) {
  if (env.NODE_ENV === 'production') {
    err('Refusing to run: NODE_ENV is "production". Demo data is for local development only.');
    return 1;
  }
  const dir = dataDirOf(env);
  const store = new Store(dir);
  await store.init();
  const force = argv.includes('--force');
  if (store.get('accounts').items.length > 0 && !force) {
    err(`The data folder ${dir} already has accounts. Use a fresh DATA_DIR, or add --force to add the demo records anyway.`);
    return 1;
  }
  const catalog = await createCatalogLoader(path.resolve(SERVER_DIR, env.CATALOG_FILE || '../assets/js/catalog.js')).get();
  const password = 'demo-password-1';
  const passwordHash = await hashPassword(password);
  const at = new Date().toISOString();
  const mk = (company, email, status, gstin, credit) => ({
    id: newId('acc'), company, gstin, name: 'DEMO Contact', email, phone: '+91 90000 00000', city: 'Pune', state: 'Maharashtra',
    stateCode: gstin.slice(0, 2), status, passwordHash,
    credit: { status: 'none', limit: 0, used: 0, termsDays: 0, updatedAt: at, ...credit },
    discountPct: 0, customPrices: {}, adminNote: 'DEMO account', shipTo: [], createdAt: at, demo: true,
  });
  const accounts = [
    mk('DEMO Pending Traders', 'demo.pending@example.com', 'pending', '27AAAAA0000A1Z5'),
    mk('DEMO Verified Works', 'demo.verified@example.com', 'verified', '29AAAAA0000A1Z5'),
    mk('DEMO Credit Industries', 'demo.credit@example.com', 'verified', '27AAAAA0000B1Z5', { status: 'approved', limit: 200000, termsDays: 30 }),
  ];
  let added = 0;
  await store.tx(['accounts', 'commercial', 'settings', 'audit'], (d) => {
    for (const a of accounts) {
      if (d.accounts.items.some((x) => x.email === a.email)) continue;
      d.accounts.items.push(a);
      added++;
    }
    d.audit.items.push({ id: newId('aud'), at, actor: 'cli:demo', action: 'demo.seed', entity: 'demo', entityId: 'demo', note: 'DEMO data added for local development' });
    if (!Object.keys(d.settings).length) {
      d.settings = {
        business: { name: 'Bearingsetu (DEMO)', stateCode: '27', state: 'Maharashtra' },
        pricing: { mode: 'list', gstRate: 18 },
        shipping: { mode: 'flat', flatFee: 250, freeOver: 25000 },
      };
    }
    // DEMO prices for the first few catalogue products so list pricing can be tried. They are invented.
    catalog.products.slice(0, 8).forEach((p, i) => {
      if (d.commercial.items[p.id]) return;
      d.commercial.items[p.id] = { price: 100 + i * 37.5, tiers: [[10, 95 + i * 35]], stock: 100, leadDays: 2, moq: 1 };
    });
    d.commercial.updatedAt = at;
  });
  out('DEMO data added. This is for local development only; never use it in production.');
  out(`  ${added} demo account(s), password for all: ${password}`);
  out('  demo.pending@example.com (pending), demo.verified@example.com (verified, no credit), demo.credit@example.com (verified, credit approved 2,00,000 / 30 days)');
  out(`  ${Math.min(8, catalog.products.length)} DEMO prices on the first catalogue products; settings set to list pricing with flat freight.`);
  return 0;
}

// ---- entry point -------------------------------------------------------------
function defaultIo() {
  const interactive = Boolean(process.stdin.isTTY);
  return {
    interactive,
    prompt(label, hidden = false) {
      return new Promise((resolve) => {
        if (!interactive) {
          let data = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', (c) => { data += c; });
          process.stdin.on('end', () => resolve(data.split(/\r?\n/)[0] || ''));
          return;
        }
        process.stdout.write(label);
        let value = '';
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        const onData = (ch) => {
          for (const c of ch) {
            if (c === '\r' || c === '\n' || c === '\u0004') {
              process.stdin.setRawMode(false);
              process.stdin.pause();
              process.stdin.off('data', onData);
              process.stdout.write('\n');
              return resolve(value);
            }
            if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
            if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
            else value += c;
          }
        };
        process.stdin.on('data', onData);
        void hidden;
      });
    },
  };
}

export async function main(argv, { env = process.env, io = defaultIo(), out = console.log, err = console.error } = {}) {
  const [cmd, ...rest] = argv;
  const ctx = { env, argv: rest, io, out, err };
  switch (cmd) {
    case 'init': return init(ctx);
    case 'hash-password': return hashPasswordCommand(ctx);
    case 'demo': return demo(ctx);
    default:
      err('Usage: node server/cli.mjs <command>\n  init            create the data folder and print next steps\n  hash-password   hash an admin password for ADMIN_PASSWORD\n  demo            add DEMO data (local development only)');
      return cmd ? 1 : 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnvFile(path.join(SERVER_DIR, '.env'));
  process.exitCode = await main(process.argv.slice(2));
}
