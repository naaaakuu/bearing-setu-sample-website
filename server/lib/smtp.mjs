// A small SMTP client (RFC 5321) using only node:net and node:tls.
//   EHLO, STARTTLS (when offered and not already secure), AUTH PLAIN / LOGIN, MAIL FROM, RCPT TO,
//   DATA with dot-stuffing, QUIT.
// `connect` and `startTls` can be injected so tests run against a scripted fake server, with no network.
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';

export class SmtpError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'SmtpError';
    this.code = code;
  }
}

const defaultConnect = ({ host, port, secure }) =>
  new Promise((resolve, reject) => {
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    socket.once('error', reject);
    socket.once(secure ? 'secureConnect' : 'connect', () => {
      socket.off('error', reject);
      resolve(socket);
    });
  });

const defaultStartTls = (socket, { host }) =>
  new Promise((resolve, reject) => {
    const secured = tls.connect({ socket, servername: host });
    secured.once('error', reject);
    secured.once('secureConnect', () => {
      secured.off('error', reject);
      resolve(secured);
    });
  });

const SAFE_ADDRESS = /^[^\s<>()[\]\\,;:"]+@[^\s<>()[\]\\,;:"]+$/;
export const assertAddress = (a) => {
  if (typeof a !== 'string' || !SAFE_ADDRESS.test(a) || a.length > 254) throw new SmtpError(`Invalid email address: ${String(a).slice(0, 60).replace(/[\r\n]/g, ' ')}`);
  return a;
};

/** Dot-stuffs a message and makes sure it uses CRLF and ends with CRLF. */
export function dotStuff(message) {
  let m = message.replace(/\r\n|\r|\n/g, '\r\n');
  if (!m.endsWith('\r\n')) m += '\r\n';
  return m.replace(/(^|\r\n)\./g, '$1..');
}

const ehloName = () => {
  const h = os.hostname().replace(/[^A-Za-z0-9.-]/g, '');
  return h || 'localhost';
};

/**
 * Send one message. Options:
 *   host, port, secure, user, pass, from (address), to ([address]), message (full RFC 5322 text)
 *   connect, startTls, timeoutMs, clientName
 * Resolves { accepted: [...], rejected: [...] }. Throws SmtpError on failure.
 */
export async function sendSmtp(opts) {
  const {
    host, port = opts.secure ? 465 : 587, secure = false, user = '', pass = '', from, to, message,
    connect = defaultConnect, startTls = defaultStartTls, timeoutMs = 20000, clientName = ehloName(),
  } = opts;
  if (!host) throw new SmtpError('SMTP_HOST is not set.');
  assertAddress(from);
  const recipients = to.map(assertAddress);
  if (!recipients.length) throw new SmtpError('No recipients.');

  let socket = await connect({ host, port, secure });
  let encrypted = !!secure;
  let buffer = '';
  const replies = []; // complete replies waiting to be read
  let waiter = null;
  let closedError = null;

  const wake = () => { if (waiter) { const w = waiter; waiter = null; w(); } };
  const onData = (chunk) => { buffer += chunk.toString('utf8'); parse(); wake(); };
  const onClose = () => { closedError ??= new SmtpError('The mail server closed the connection.'); wake(); };
  const onError = (e) => { closedError = new SmtpError(`Connection error: ${e.message}`); wake(); };
  let pending = { code: null, lines: [] };

  function parse() {
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      const m = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!m) continue; // ignore noise
      pending.code = Number(m[1]);
      pending.lines.push(m[3]);
      if (m[2] === ' ') {
        replies.push(pending);
        pending = { code: null, lines: [] };
      }
    }
  }
  const attach = (s) => { s.on('data', onData); s.on('close', onClose); s.on('error', onError); };
  const detach = (s) => { s.off('data', onData); s.off('close', onClose); s.off('error', onError); };
  attach(socket);

  const readReply = async () => {
    const deadline = Date.now() + timeoutMs;
    while (!replies.length) {
      if (closedError) throw closedError;
      const left = deadline - Date.now();
      if (left <= 0) throw new SmtpError('Timed out waiting for the mail server.');
      await new Promise((resolve) => {
        const t = setTimeout(resolve, left);
        waiter = () => { clearTimeout(t); resolve(); };
      });
    }
    return replies.shift();
  };
  const write = (text) => new Promise((resolve, reject) => socket.write(text, (e) => (e ? reject(e) : resolve())));
  const command = async (text, expect, { secret = false } = {}) => {
    await write(`${text}\r\n`);
    const r = await readReply();
    if (!expect.includes(r.code)) {
      // never echo a credential line back in an error
      throw new SmtpError(`Mail server replied ${r.code} to ${secret ? 'a login step' : text.split(' ')[0]}: ${r.lines.join(' ').slice(0, 200)}`, r.code);
    }
    return r;
  };

  try {
    const greeting = await readReply();
    if (greeting.code !== 220) throw new SmtpError(`Mail server greeting was ${greeting.code}.`, greeting.code);

    let ehlo = await command(`EHLO ${clientName}`, [250]);
    const caps = () => ehlo.lines.map((l) => l.toUpperCase());
    if (!encrypted && caps().some((l) => l === 'STARTTLS')) {
      await command('STARTTLS', [220]);
      detach(socket);
      socket = await startTls(socket, { host });
      encrypted = true;
      // Throw away anything received before the upgrade: bytes injected into the clear-text part must never be trusted.
      buffer = '';
      replies.length = 0;
      pending = { code: null, lines: [] };
      attach(socket);
      ehlo = await command(`EHLO ${clientName}`, [250]);
    }

    if (user) {
      if (!encrypted) throw new SmtpError('Refusing to send the SMTP password over an unencrypted connection. Use port 465 with SMTP_SECURE=true, or a server that offers STARTTLS.');
      const authLine = caps().find((l) => l.startsWith('AUTH ') || l.startsWith('AUTH='));
      if (!authLine) throw new SmtpError('The mail server does not offer login (AUTH), but SMTP_USER is set.');
      const methods = authLine.slice(5).split(/\s+/);
      if (methods.includes('PLAIN')) {
        const token = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
        await command(`AUTH PLAIN ${token}`, [235], { secret: true });
      } else if (methods.includes('LOGIN')) {
        await command('AUTH LOGIN', [334]);
        await command(Buffer.from(user, 'utf8').toString('base64'), [334], { secret: true });
        await command(Buffer.from(pass, 'utf8').toString('base64'), [235], { secret: true });
      } else {
        throw new SmtpError(`The mail server offers no supported login method (${methods.join(', ')}).`);
      }
    }

    await command(`MAIL FROM:<${from}>`, [250]);
    const accepted = [];
    const rejected = [];
    for (const rcpt of recipients) {
      await write(`RCPT TO:<${rcpt}>\r\n`);
      const r = await readReply();
      (r.code === 250 || r.code === 251 ? accepted : rejected).push(rcpt);
    }
    if (!accepted.length) throw new SmtpError('The mail server rejected every recipient.', 550);

    await command('DATA', [354]);
    await write(`${dotStuff(message)}.\r\n`);
    const done = await readReply();
    if (done.code !== 250) throw new SmtpError(`Mail server refused the message (${done.code}): ${done.lines.join(' ').slice(0, 200)}`, done.code);
    try { await command('QUIT', [221]); } catch { /* the message is already accepted */ }
    return { accepted, rejected };
  } finally {
    detach(socket);
    socket.on?.('error', () => {}); // ignore late errors while closing
    try { socket.end?.(); } catch { /* ignore */ }
    try { socket.destroy?.(); } catch { /* ignore */ }
  }
}
