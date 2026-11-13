import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../cli.mjs';
import { verifyPassword } from '../lib/auth.mjs';
import { createApp } from '../app.mjs';

const capture = () => {
  const out = []; const err = [];
  return { out: (m) => out.push(m), err: (m) => err.push(m), lines: () => out.join('\n'), errors: () => err.join('\n') };
};
const io = (answers) => ({ interactive: answers.length > 1, prompt: async () => answers.shift() });

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'bs-cli-'));
  const catalog = join(dir, 'catalog.js');
  await writeFile(catalog, `window.BS_CATALOG = ${JSON.stringify({ categories: [], brands: [], products: [1, 2, 3].map((i) => ({ id: `p-${i}`, pn: `P${i}`, brand: 'x', title: `Part ${i}`, cat: 'c' })) })};`);
  return { dir, env: { DATA_DIR: join(dir, 'data'), CATALOG_FILE: catalog, BS_ENV_FILE: join(dir, '.env') } };
}

test('init creates an empty data folder, a private .env with a fresh SECRET, and prints next steps', async () => {
  const { env } = await fixture();
  const c = capture();
  assert.equal(await main(['init'], { env, ...c }), 0);
  const accounts = JSON.parse(await readFile(join(env.DATA_DIR, 'accounts.json'), 'utf8'));
  assert.deepEqual(accounts, { items: [] }, 'production data starts empty');
  assert.deepEqual(JSON.parse(await readFile(join(env.DATA_DIR, 'commercial.json'), 'utf8')).items, {}, 'no prices');
  const envText = await readFile(env.BS_ENV_FILE, 'utf8');
  assert.match(envText, /^SECRET=[A-Za-z0-9_-]{60,}$/m);
  assert.equal((await stat(env.BS_ENV_FILE)).mode & 0o077, 0, 'only the owner can read it');
  assert.match(c.lines(), /hash-password/);
  assert.match(c.lines(), /apiBase/);
  // running it again keeps the existing .env
  const c2 = capture();
  await main(['init'], { env, ...c2 });
  assert.match(c2.lines(), /already exists/);
  assert.equal(await readFile(env.BS_ENV_FILE, 'utf8'), envText);
});

test('hash-password produces a hash that the admin login accepts', async () => {
  const c = capture();
  assert.equal(await main(['hash-password'], { env: {}, io: io(['my-new-admin-password', 'my-new-admin-password']), ...c }), 0);
  const hash = /ADMIN_PASSWORD=(scrypt:\S+)/.exec(c.lines())[1];
  assert.ok(await verifyPassword('my-new-admin-password', hash));
  assert.ok(!(await verifyPassword('something else', hash)));
  assert.ok(!c.lines().includes('my-new-admin-password'), 'the password itself is never printed');

  const short = capture();
  assert.equal(await main(['hash-password'], { env: {}, io: io(['short', 'short']), ...short }), 1);
  assert.match(short.errors(), /at least 10/);
  const mismatch = capture();
  assert.equal(await main(['hash-password'], { env: {}, io: io(['long-enough-password', 'different-password-x']), ...mismatch }), 1);
  assert.match(mismatch.errors(), /do not match/);

  const dir = await mkdtemp(join(tmpdir(), 'bs-cli-'));
  const app = createApp({ dataDir: dir, env: { SECRET: 's'.repeat(48), ADMIN_EMAIL: 'o@x.co', ADMIN_PASSWORD: hash }, log: { warn() {}, error() {} }, mailer: { send: async () => ({ status: 'sent' }) } });
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/login', body: { email: 'o@x.co', password: 'my-new-admin-password' } })).status, 200);
});

test('demo refuses to run in production and writes nothing', async () => {
  const { env } = await fixture();
  const c = capture();
  assert.equal(await main(['demo'], { env: { ...env, NODE_ENV: 'production' }, ...c }), 1);
  assert.match(c.errors(), /Refusing to run/);
  await assert.rejects(() => stat(env.DATA_DIR), 'the data folder was not even created');
});

test('demo adds clearly labelled fake data for development only, and will not pile onto real data', async () => {
  const { env } = await fixture();
  const c = capture();
  assert.equal(await main(['demo'], { env, ...c }), 0);
  assert.match(c.lines(), /DEMO/);
  assert.match(c.lines(), /never use it in production/);
  const data = JSON.parse(await readFile(join(env.DATA_DIR, 'accounts.json'), 'utf8')).items;
  assert.equal(data.length, 3);
  assert.ok(data.every((a) => a.company.startsWith('DEMO') && a.demo === true));
  assert.deepEqual(data.map((a) => a.credit.status), ['none', 'none', 'approved']);
  assert.equal(data.find((a) => a.credit.status === 'approved').credit.limit, 200000);

  const again = capture();
  assert.equal(await main(['demo'], { env, ...again }), 1, 'refuses when accounts already exist');
  assert.match(again.errors(), /already has accounts/);
  assert.equal(await main(['demo', '--force'], { env, ...capture() }), 0);
  assert.equal(JSON.parse(await readFile(join(env.DATA_DIR, 'accounts.json'), 'utf8')).items.length, 3, 'forcing never duplicates demo accounts');

  // the demo accounts really work
  const app = createApp({ dataDir: env.DATA_DIR, env: { SECRET: 's'.repeat(48), CATALOG_FILE: env.CATALOG_FILE }, log: { warn() {}, error() {} }, mailer: { send: async () => ({ status: 'sent' }) } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', body: { email: 'demo.credit@example.com', password: 'demo-password-1' } });
  assert.equal(login.status, 200);
  assert.equal(login.json.account.credit.limit, 200000);
});

test('unknown commands print usage', async () => {
  const c = capture();
  assert.equal(await main(['frobnicate'], { env: {}, ...c }), 1);
  assert.match(c.errors(), /Usage/);
  assert.equal(await main([], { env: {}, ...capture() }), 0);
});
