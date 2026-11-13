// Building emails (MIME) and delivering them: SMTP when configured, otherwise .eml files in DATA_DIR/outbox.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sendSmtp, assertAddress, SmtpError } from './smtp.mjs';
import { cleanText } from './util.mjs';

// ---- MIME ----------------------------------------------------------------
const wrap76 = (b64) => b64.replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '');
const b64 = (s) => wrap76(Buffer.from(s, 'utf8').toString('base64'));
const isAscii = (s) => /^[\x20-\x7E]*$/.test(s);

/** RFC 2047 encoded-words for non-ASCII header text, split on character boundaries (max 75 chars per word). */
export function encodeHeaderText(text) {
  const s = cleanText(text);
  if (isAscii(s)) return s;
  const words = [];
  let current = '';
  for (const ch of s) {
    if (Buffer.byteLength(current + ch, 'utf8') > 42) { words.push(current); current = ''; }
    current += ch;
  }
  if (current) words.push(current);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

/** "Name <addr>" with the name safely quoted or encoded. */
export function formatAddress(name, address) {
  const n = cleanText(name || '');
  if (!n) return address;
  if (!isAscii(n)) return `${encodeHeaderText(n)} <${address}>`;
  return /^[A-Za-z0-9 ]+$/.test(n) ? `${n} <${address}>` : `"${n.replace(/["\\]/g, '\\$&')}" <${address}>`;
}

/** Pulls the bare address out of "Name <a@b>" or "a@b". */
export function bareAddress(value) {
  const m = /<([^<>]+)>\s*$/.exec(value || '');
  return (m ? m[1] : String(value || '')).trim();
}

export function buildMime({ from, to, replyTo, subject, text, html, date = new Date(), domain = 'localhost' }) {
  const boundary = `bs_${randomBytes(12).toString('hex')}`;
  const headers = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeHeaderText(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomBytes(12).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type, body) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', b64(body), ''].join('\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${part('text/plain', text)}\r\n${part('text/html', html)}\r\n--${boundary}--\r\n`;
}

// ---- delivery ------------------------------------------------------------
/**
 * Creates the real mailer from environment variables.
 * mailer.send({ to: [addr], subject, text, html, replyTo?, fromName? }) -> { status: 'sent'|'skipped'|'failed', error? }
 */
export function createMailer({ env, dataDir, now = () => Date.now(), connect, startTls }) {
  const fromRaw = cleanText(env.MAIL_FROM || ''); // single line: no header injection through the setting
  const fromAddress = bareAddress(fromRaw) || (/@/.test(env.SMTP_USER || '') ? env.SMTP_USER : 'no-reply@localhost');
  const fromHasName = fromRaw.includes('<');
  const smtpConfigured = Boolean((env.SMTP_HOST || '').trim());
  const domain = fromAddress.split('@')[1] || 'localhost';

  return {
    smtpConfigured,
    async send({ to, subject, text, html, replyTo, fromName }) {
      try {
        const recipients = to.map(assertAddress);
        const from = fromHasName ? fromRaw : formatAddress(fromName, assertAddress(fromAddress));
        const message = buildMime({
          from, to: recipients, replyTo: replyTo && formatAddress('', assertAddress(replyTo)), subject, text, html,
          date: new Date(now()), domain,
        });
        if (!smtpConfigured) {
          const dir = join(dataDir, 'outbox');
          await mkdir(dir, { recursive: true, mode: 0o700 });
          await writeFile(join(dir, `${now()}-${randomBytes(4).toString('hex')}.eml`), message, { mode: 0o600 });
          return { status: 'skipped', error: 'SMTP is not configured; the email was saved to the outbox folder.' };
        }
        const secure = String(env.SMTP_SECURE || '').toLowerCase() === 'true';
        await sendSmtp({
          host: env.SMTP_HOST.trim(), port: Number(env.SMTP_PORT) || undefined, secure,
          user: env.SMTP_USER || '', pass: env.SMTP_PASS || '',
          from: fromAddress, to: recipients, message, connect, startTls,
        });
        return { status: 'sent' };
      } catch (e) {
        // SmtpError messages are written to be safe to show; anything else gets a generic text.
        return { status: 'failed', error: e instanceof SmtpError ? e.message : `Could not send: ${e.code || e.name}` };
      }
    },
  };
}

/**
 * A serial queue in front of a mailer. enqueue() returns immediately (so web requests never wait for SMTP);
 * each result is logged through `log(entry)`. idle() resolves when everything queued so far is done.
 */
export function createMailQueue({ mailer, log, now, maxQueue = 500 }) {
  let tail = Promise.resolve();
  let size = 0;
  const entry = (msg, status, error) => ({
    at: new Date(now()).toISOString(), to: msg.to.join(', '), subject: msg.subject, event: msg.event || '', status, error: error || '',
  });
  return {
    enqueue(msg) {
      if (size >= maxQueue) {
        tail = tail.then(() => log(entry(msg, 'failed', 'Too many emails waiting; this one was dropped.')));
        return;
      }
      size++;
      tail = tail.then(async () => {
        let result;
        try { result = await mailer.send(msg); } catch (e) { result = { status: 'failed', error: `Could not send: ${e.name}` }; }
        size--;
        try { await log(entry(msg, result.status, result.error)); } catch (e) { console.error('[mail] could not write the email log:', e.message); }
      });
    },
    idle: () => tail,
  };
}
