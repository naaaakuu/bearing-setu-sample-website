// The home page banner: validated, public, and unable to carry scripts or odd links.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './helpers.mjs';

test('banner: has a safe default and is part of the public config', async () => {
  const t = await makeApp();
  const r = await t.get('/api/config');
  assert.equal(r.status, 200);
  assert.equal(r.json.banner.enabled, true);
  assert.ok(r.json.banner.text.length > 10);
  assert.equal(r.json.banner.linkUrl, 'quick-order.html#rfq');
  assert.doesNotMatch(JSON.stringify(r.json.banner), /same[- ]day|free|credit|discount|%/i, 'default text makes no delivery, price or credit claims');
});

test('banner: the administrator can change, switch off and retire it', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  let r = await adm.put('/api/admin/settings', { banner: { text: 'Closed on 1 January.', linkText: '', linkUrl: '', endsOn: '2027-01-02' } });
  assert.equal(r.status, 200);
  assert.deepEqual((await t.get('/api/config')).json.banner, { enabled: true, text: 'Closed on 1 January.', linkText: '', linkUrl: '', endsOn: '2027-01-02' });
  r = await adm.put('/api/admin/settings', { banner: { enabled: false } });
  assert.equal(r.status, 200);
  assert.equal((await t.get('/api/config')).json.banner.enabled, false);
  assert.equal((await t.get('/api/config')).json.banner.text, 'Closed on 1 January.', 'other fields are kept');
});

test('banner: links are limited to this site or https, and text is length-limited', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'http://insecure.example.com', '//evil.example.com', 'https://x.example.com/"><script>', '../secret.html', 'shop.html onclick=x']) {
    const r = await adm.put('/api/admin/settings', { banner: { linkUrl: bad } });
    assert.equal(r.status, 400, `rejects ${bad}`);
  }
  for (const good of ['shop.html', 'quick-order.html#rfq', 'shop.html?cat=seals', '#finder', 'https://example.com/page?a=1']) {
    const r = await adm.put('/api/admin/settings', { banner: { linkUrl: good } });
    assert.equal(r.status, 200, `accepts ${good}`);
  }
  assert.equal((await adm.put('/api/admin/settings', { banner: { text: 'x'.repeat(161) } })).status, 400);
  assert.equal((await adm.put('/api/admin/settings', { banner: { endsOn: 'next week' } })).status, 400);
});

test('banner: only an administrator can change it', async () => {
  const t = await makeApp();
  assert.equal((await t.put('/api/admin/settings', { banner: { enabled: false } })).status, 401);
  const c = await t.customer({ verify: true });
  assert.equal((await t.put('/api/admin/settings', { banner: { enabled: false } }, c.as)).status, 401);
});
