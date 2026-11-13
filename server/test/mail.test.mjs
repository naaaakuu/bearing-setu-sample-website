import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sendSmtp, dotStuff, SmtpError } from '../lib/smtp.mjs';
import { buildMime, encodeHeaderText, formatAddress, bareAddress, createMailer } from '../lib/mail.mjs';
import * as tpl from '../lib/templates.mjs';
import { makeApp } from './helpers.mjs';

// ---- a scripted fake SMTP server speaking through a fake socket ---------------------------
function fakeServer({ starttls = true, auth = ['PLAIN', 'LOGIN'], user = 'mailer', pass = 'p@ss word', rejectRcpt = [], dataReply = '250 2.0.0 queued', authAlways = false, silent = false, chunk = false } = {}) {
  const log = [];
  const state = { encrypted: false, upgrades: 0, message: null, rawMessage: null, authStep: null, inData: false, buffer: '', dataBuf: '' };
  const socket = new EventEmitter();
  const reply = (text) => { if (silent) return; const data = Buffer.from(text.replace(/\r?\n/g, '\r\n') + '\r\n'); setImmediate(() => { if (chunk) { socket.emit('data', data.subarray(0, 5)); socket.emit('data', data.subarray(5)); } else socket.emit('data', data); }); };
  const handle = (line) => {
    log.push(line);
    if (state.authStep === 'user') { state.authStep = 'pass'; return reply('334 UGFzc3dvcmQ6'); }
    if (state.authStep === 'pass') { state.authStep = null; return reply(Buffer.from(line, 'base64').toString() === pass ? '235 2.7.0 ok' : '535 5.7.8 bad credentials'); }
    const [verb, ...rest] = line.split(' ');
    switch (verb.toUpperCase()) {
      case 'EHLO': {
        const lines = ['250-fake.example'];
        if (starttls && !state.encrypted) lines.push('250-STARTTLS');
        if (auth.length && (state.encrypted || authAlways)) lines.push(`250-AUTH ${auth.join(' ')}`);
        lines.push('250 8BITMIME');
        return reply(lines.join('\n'));
      }
      case 'STARTTLS': return reply('220 ready');
      case 'AUTH':
        if (rest[0] === 'PLAIN') return reply(Buffer.from(rest[1], 'base64').toString() === `\0${user}\0${pass}` ? '235 2.7.0 ok' : '535 5.7.8 bad credentials');
        state.authStep = 'user';
        return reply('334 VXNlcm5hbWU6');
      case 'MAIL': return reply('250 ok');
      case 'RCPT': return reply(rejectRcpt.some((r) => line.includes(r)) ? '550 5.1.1 no such user' : '250 ok');
      case 'DATA': state.inData = true; return reply('354 go ahead');
      case 'QUIT': return reply('221 bye');
      default: return reply('500 what?');
    }
  };
  socket.write = (text, cb) => {
    if (state.inData) {
      state.dataBuf += text;
      if (state.dataBuf.endsWith('\r\n.\r\n')) {
        state.inData = false;
        state.rawMessage = state.dataBuf.slice(0, -3);
        state.message = state.rawMessage.replace(/^\.\./gm, '.'); // what a real server stores
        state.dataBuf = '';
        log.push('<message>');
        reply(dataReply);
      }
    } else {
      state.buffer += text;
      let i;
      while ((i = state.buffer.indexOf('\r\n')) !== -1) { const line = state.buffer.slice(0, i); state.buffer = state.buffer.slice(i + 2); handle(line); }
    }
    cb?.();
    return true;
  };
  socket.end = () => {}; socket.destroy = () => {};
  const connect = async (opts) => { state.connectOpts = opts; if (opts.secure) state.encrypted = true; setImmediate(() => reply('220 fake.example ESMTP')); return socket; };
  const startTls = async (s, opts) => { state.encrypted = true; state.upgrades++; state.tlsHost = opts.host; return s; };
  return { socket, log, state, connect, startTls };
}

const base = (srv, over = {}) => ({ host: 'smtp.example.com', port: 587, from: 'sales@example.com', to: ['buyer@example.com'], message: 'Subject: Hi\r\n\r\nHello\r\n', connect: srv.connect, startTls: srv.startTls, timeoutMs: 1000, clientName: 'tester', ...over });

test('SMTP: EHLO, STARTTLS, a second EHLO, AUTH PLAIN, envelope, DATA and QUIT in the right order', async () => {
  const srv = fakeServer();
  const r = await sendSmtp(base(srv, { user: 'mailer', pass: 'p@ss word' }));
  assert.deepEqual(r, { accepted: ['buyer@example.com'], rejected: [] });
  assert.deepEqual(srv.log, [
    'EHLO tester', 'STARTTLS', 'EHLO tester',
    `AUTH PLAIN ${Buffer.from('\0mailer\0p@ss word').toString('base64')}`,
    'MAIL FROM:<sales@example.com>', 'RCPT TO:<buyer@example.com>', 'DATA', '<message>', 'QUIT',
  ]);
  assert.equal(srv.state.upgrades, 1);
  assert.equal(srv.state.tlsHost, 'smtp.example.com', 'the certificate is checked against the SMTP host');
  assert.equal(srv.state.message, 'Subject: Hi\r\n\r\nHello\r\n');
});

test('SMTP: lines that start with a dot are dot-stuffed and the message ends with CRLF.CRLF', async () => {
  const srv = fakeServer({ starttls: false });
  const body = 'Subject: dots\r\n\r\n.hidden line\r\n..two dots\r\nnormal\r\n.\r\nlast line without newline';
  await sendSmtp(base(srv, { message: body }));
  assert.match(srv.state.rawMessage, /\r\n\.\.hidden line\r\n/, 'a leading dot is doubled on the wire');
  assert.match(srv.state.rawMessage, /\r\n\.\.\.two dots\r\n/);
  assert.match(srv.state.rawMessage, /\r\n\.\.\r\nlast line/, 'a lone dot line cannot end the message early');
  assert.equal(srv.state.message, `${body.replace(/\n/g, '\n')}\r\n`, 'the server sees the original text');
  assert.equal(dotStuff('.a\n.b'), '..a\r\n..b\r\n');
  assert.equal(dotStuff('x\r\n.\r\n'), 'x\r\n..\r\n');
});

test('SMTP: falls back to AUTH LOGIN when PLAIN is not offered, over STARTTLS', async () => {
  const srv = fakeServer({ auth: ['LOGIN'] });
  await sendSmtp(base(srv, { user: 'mailer', pass: 'p@ss word' }));
  const login = srv.log.slice(srv.log.indexOf('AUTH LOGIN'), srv.log.indexOf('AUTH LOGIN') + 3);
  assert.deepEqual(login, ['AUTH LOGIN', Buffer.from('mailer').toString('base64'), Buffer.from('p@ss word').toString('base64')]);
});

test('SMTP: implicit TLS (SMTP_SECURE=true) skips STARTTLS even if offered', async () => {
  const srv = fakeServer();
  await sendSmtp(base(srv, { port: 465, secure: true, user: 'mailer', pass: 'p@ss word' }));
  assert.equal(srv.state.connectOpts.secure, true);
  assert.equal(srv.state.connectOpts.port, 465);
  assert.ok(!srv.log.includes('STARTTLS'));
  assert.ok(srv.log.some((l) => l.startsWith('AUTH PLAIN')));
});

test('SMTP: no login details means no AUTH, and a server without STARTTLS is fine for a local relay', async () => {
  const srv = fakeServer({ starttls: false });
  await sendSmtp(base(srv));
  assert.ok(!srv.log.some((l) => l.startsWith('AUTH')));
  assert.equal(srv.state.upgrades, 0);
});

test('SMTP: the password is never sent over an unencrypted connection', async () => {
  const srv = fakeServer({ starttls: false, authAlways: true });
  await assert.rejects(() => sendSmtp(base(srv, { user: 'mailer', pass: 'p@ss word' })), /unencrypted/);
  assert.ok(!srv.log.some((l) => /AUTH/.test(l)), 'nothing secret reached the wire');
  const noAuth = fakeServer({ auth: [] });
  await assert.rejects(() => sendSmtp(base(noAuth, { user: 'mailer', pass: 'x' })), /does not offer login/);
});

test('SMTP: a refused login or message raises a clear error that never repeats the password', async () => {
  const srv = fakeServer();
  await assert.rejects(() => sendSmtp(base(srv, { user: 'mailer', pass: 'WRONG-secret-1' })), (e) => {
    assert.ok(e instanceof SmtpError);
    assert.equal(e.code, 535);
    assert.doesNotMatch(e.message, /WRONG-secret-1/);
    assert.doesNotMatch(e.message, new RegExp(Buffer.from('WRONG-secret-1').toString('base64')));
    return true;
  });
  const refused = fakeServer({ starttls: false, dataReply: '554 5.7.1 spam' });
  await assert.rejects(() => sendSmtp(base(refused)), /refused the message \(554\)/);
});

test('SMTP: some recipients may be rejected, but not all', async () => {
  const srv = fakeServer({ starttls: false, rejectRcpt: ['bad@example.com'] });
  const r = await sendSmtp(base(srv, { to: ['good@example.com', 'bad@example.com'] }));
  assert.deepEqual(r, { accepted: ['good@example.com'], rejected: ['bad@example.com'] });
  const none = fakeServer({ starttls: false, rejectRcpt: ['@'] });
  await assert.rejects(() => sendSmtp(base(none)), /rejected every recipient/);
});

test('SMTP: addresses that could inject commands are refused before anything is sent', async () => {
  for (const evil of ['a@b.com>\r\nRCPT TO:<x@y.com', 'a b@c.com', 'a@b.com\nDATA', '<a@b.com>', 'nobody']) {
    const srv = fakeServer({ starttls: false });
    await assert.rejects(() => sendSmtp(base(srv, { to: [evil] })), SmtpError, evil);
    assert.equal(srv.log.length, 0);
  }
  const srv = fakeServer({ starttls: false });
  await assert.rejects(() => sendSmtp(base(srv, { from: 'x@y.com\r\nRSET' })), SmtpError);
});

test('SMTP: replies split over several chunks, and a silent or closing server, are handled', async () => {
  const chunked = fakeServer({ chunk: true });
  await sendSmtp(base(chunked, { user: 'mailer', pass: 'p@ss word' }));
  const silent = fakeServer({ silent: true });
  await assert.rejects(() => sendSmtp(base(silent, { timeoutMs: 30 })), /Timed out/);
  const closing = fakeServer({ starttls: false });
  closing.connect = async () => { setImmediate(() => closing.socket.emit('close')); return closing.socket; };
  await assert.rejects(() => sendSmtp(base(closing)), /closed the connection/);
  const refusing = fakeServer();
  refusing.connect = async () => { setImmediate(() => refusing.socket.emit('data', Buffer.from('554 no service\r\n'))); return refusing.socket; };
  await assert.rejects(() => sendSmtp(base(refusing)), /greeting was 554/);
});

test('mailer: builds a UTF-8 multipart message and reports sent, failed and skipped', async () => {
  const srv = fakeServer();
  const env = { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USER: 'mailer', SMTP_PASS: 'p@ss word', MAIL_FROM: 'sales@example.com' };
  const mailer = createMailer({ env, dataDir: '/nonexistent', connect: srv.connect, startTls: srv.startTls });
  const r = await mailer.send({ to: ['buyer@example.com'], subject: 'Quotation Q-1 for Zoë ₹ 5,00,000', text: 'plain Zoë', html: '<p>html Zoë</p>', fromName: 'Bearingsetu Sales', replyTo: 'help@example.com' });
  assert.deepEqual(r, { status: 'sent' });
  const msg = srv.state.message;
  assert.match(msg, /^From: Bearingsetu Sales <sales@example\.com>\r\n/);
  assert.match(msg, /\r\nReply-To: help@example\.com\r\n/);
  assert.match(msg, /\r\nSubject: =\?UTF-8\?B\?/);
  assert.match(msg, /MIME-Version: 1\.0/);
  const subject = /Subject: ((?:=\?UTF-8\?B\?[^?]+\?=\r\n? ?)+)/.exec(msg)[1];
  const decoded = [...subject.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map((m) => Buffer.from(m[1], 'base64').toString('utf8')).join('');
  assert.equal(decoded, 'Quotation Q-1 for Zoë ₹ 5,00,000');
  const parts = [...msg.matchAll(/Content-Type: (text\/\w+); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)];
  assert.deepEqual(parts.map((p) => p[1]), ['text/plain', 'text/html']);
  assert.equal(Buffer.from(parts[0][2].replace(/\r\n/g, ''), 'base64').toString('utf8'), 'plain Zoë');
  assert.equal(Buffer.from(parts[1][2].replace(/\r\n/g, ''), 'base64').toString('utf8'), '<p>html Zoë</p>');
  for (const line of msg.split('\r\n')) assert.ok(line.length <= 998);

  const down = createMailer({ env, dataDir: '/x', connect: async () => { throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:587'), { code: 'ECONNREFUSED' }); }, startTls: srv.startTls });
  const f = await down.send({ to: ['buyer@example.com'], subject: 's', text: 't', html: 'h' });
  assert.equal(f.status, 'failed');
  assert.match(f.error, /ECONNREFUSED/);
  assert.doesNotMatch(f.error, /p@ss word|10\.0\.0\.1/, 'no secrets or addresses in the stored error');
  const bad = await mailer.send({ to: ['not an address'], subject: 's', text: 't', html: 'h' });
  assert.equal(bad.status, 'failed');
});

test('mailer without SMTP settings saves .eml files and says so', async () => {
  const t = await makeApp();
  const mailer = createMailer({ env: { MAIL_FROM: 'sales@example.com' }, dataDir: t.dir });
  const r = await mailer.send({ to: ['a@example.com'], subject: 'Hello', text: 'x', html: '<p>x</p>' });
  assert.equal(r.status, 'skipped');
  const files = await readdir(join(t.dir, 'outbox'));
  assert.equal(files.length, 1);
  assert.match(files[0], /\.eml$/);
  assert.match(await readFile(join(t.dir, 'outbox', files[0]), 'utf8'), /^From: sales@example\.com\r\nTo: a@example\.com\r\n/);
});

test('MIME helpers: header encoding, addresses and long subjects', () => {
  assert.equal(encodeHeaderText('Plain subject'), 'Plain subject');
  const long = encodeHeaderText('Ünïcode '.repeat(20));
  for (const word of long.split('\r\n ')) assert.ok(word.length <= 75, `encoded word too long: ${word.length}`);
  assert.equal(encodeHeaderText('Line\r\nBcc: evil@example.com'), 'Line Bcc: evil@example.com', 'a newline can never start a new header');
  assert.equal(formatAddress('Sales Team', 'a@b.com'), 'Sales Team <a@b.com>');
  assert.equal(formatAddress('Smith, "Bob"', 'a@b.com'), '"Smith, \\"Bob\\"" <a@b.com>');
  assert.match(formatAddress('Zoë', 'a@b.com'), /^=\?UTF-8\?B\?.*\?= <a@b\.com>$/);
  assert.equal(formatAddress('', 'a@b.com'), 'a@b.com');
  assert.equal(bareAddress('Name <a@b.com>'), 'a@b.com');
  assert.equal(bareAddress('a@b.com'), 'a@b.com');
  const mime = buildMime({ from: 'a@b.com', to: ['c@d.com', 'e@f.com'], subject: 's', text: 't', html: 'h', date: new Date('2026-06-15T10:00:00Z') });
  assert.match(mime, /\r\nTo: c@d\.com, e@f\.com\r\n/);
  assert.match(mime, /\r\nDate: Mon, 15 Jun 2026 10:00:00 \+0000\r\n/);
  assert.match(mime, /\r\nMessage-ID: <[0-9a-f]+@localhost>\r\n/);
  assert.ok(mime.endsWith('--\r\n'));
});

test('email templates escape every user supplied value in the HTML part and never contain secrets', () => {
  const evil = `<img src=x onerror="alert(1)">'&"\``;
  const S = { biz: evil, storefrontUrl: 'https://shop.example.com', contactEmail: 'help@example.com' };
  const account = { company: evil, name: evil, email: 'a@b.com', gstin: '27ABCDE1234F1Z5', phone: evil, city: evil, state: evil };
  const quote = { ref: 'Q-2026-00001', kind: 'quote', contact: { name: evil, company: evil, email: 'a@b.com', phone: evil, notes: evil }, lines: [{ pn: evil, brand: evil, qty: 1, note: evil, unitPrice: 10, lineTotal: 10 }], pricing: { subtotal: 10, freight: 0, gstType: 'IGST', gstRate: 18, gstAmount: 1.8, total: 11.8, validUntil: '2026-07-01', note: evil } };
  const order = { no: 'BS-2026-00001', lines: [{ pn: evil, qty: 1, unitPrice: 10, lineTotal: 10 }], subtotal: 10, freight: 0, gstType: 'IGST', gstRate: 18, gstAmount: 1.8, total: 11.8, payment: { method: 'credit', termsDays: 30 }, shipTo: { line1: evil, city: evil, state: evil, pin: '411001' }, poNumber: evil, status: 'dispatched', tracking: { carrier: evil, ref: evil } };
  const change = { kind: 'approved', rows: [{ label: 'Credit limit', from: evil, to: evil }], after: { status: 'approved', limit: 1, termsDays: 30 } };
  const all = [
    tpl.registrationReceived(S, account), tpl.staffNewRegistration(S, account), tpl.accountStatus(S, account, 'verified'),
    tpl.creditChanged(S, account, change, { note: evil, outstanding: 5 }), tpl.creditPayment(S, account, { amount: 1, ref: evil, outstanding: 0 }),
    tpl.quoteReceived(S, quote), tpl.staffNewQuote(S, quote), tpl.quoteResponded(S, quote), tpl.quoteDeclined(S, quote, evil),
    tpl.orderPlaced(S, account, order), tpl.staffNewOrder(S, account, order), tpl.orderStatus(S, account, order, evil), tpl.orderPaid(S, account, order),
  ];
  for (const m of all) {
    assert.doesNotMatch(m.html, /<img/i, m.subject);
    assert.doesNotMatch(m.html, /onerror="/, m.subject);
    assert.ok(m.html.includes('&lt;img'), `${m.subject} should contain the escaped value`);
    assert.doesNotMatch(m.subject, /[\r\n]/);
    assert.doesNotMatch(m.text + m.html, /password|token/i, 'no secrets in email');
  }
  assert.equal(tpl.esc(`<>&"'\``), '&lt;&gt;&amp;&quot;&#39;&#96;');
  assert.equal(tpl.esc(null), '');
  // a storefront link must be a plain http(s) address
  const bad = tpl.accountStatus({ ...S, storefrontUrl: 'javascript:alert(1)' }, account, 'verified');
  assert.doesNotMatch(bad.html, /javascript:/);
});
