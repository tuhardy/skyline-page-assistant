// Real-device read-only inspection of the EIMS settings page (EN + CN variants).
// Logs in through the real login form, fetches eims_settings_en/cn.html same-origin
// from inside the mainindex frame (the device checks the Referer), saves the HTML
// under device-pages/ (gitignored) and prints only non-secret DOM facts as JSON.
// Password input values are masked; credentials come from env vars, never persisted.
// Usage: SKYLINE_DEVICE_USER=... SKYLINE_DEVICE_PASS=... node real-device-eims-inspect.mjs [cdpPort] [baseUrl] [label]
import { mkdir, writeFile } from 'node:fs/promises';

const port = process.argv[2] || '9334';
const base = (process.argv[3] || 'http://192.168.90.246').replace(/\/$/, '');
const label = process.argv[4] || 'device';
const username = process.env.SKYLINE_DEVICE_USER || '';
const password = process.env.SKYLINE_DEVICE_PASS || '';
if (!username || !password) {
  throw new Error('Set SKYLINE_DEVICE_USER and SKYLINE_DEVICE_PASS for the test device.');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const target = await (await fetch(
  `http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${base}/main_en.html`)}`,
  { method: 'PUT' }
)).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
function call(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

try {
  await call('Page.enable');
  await call('Runtime.enable');
  await sleep(3000);

  const loginState = await evaluate(`({
    url: location.href,
    hasAccount: !!document.getElementById('accountID')
  })`);
  if (loginState.hasAccount) {
    await evaluate(`
      document.getElementById('accountID').value = ${JSON.stringify(username)};
      document.getElementById('passwordID').value = ${JSON.stringify(password)};
      submitData();
    `);
    await sleep(4000);
  }
  const landed = await evaluate('location.pathname');
  if (!/^\/main_(?:en|cn)\.html$/.test(landed)) {
    throw new Error(`Login did not reach the main page (at ${landed}).`);
  }

  // Fetch the candidate pages from inside the mainindex frame so the Referer matches.
  const pageNames = ['eims_settings_en.html', 'eims_settings_cn.html', 'app_esn_en.html', 'app_esn_cn.html'];
  const pages = await evaluate(`(async () => {
    const frame = document.querySelector('iframe');
    const win = frame && frame.contentWindow ? frame.contentWindow : window;
    const out = {};
    for (const name of ${JSON.stringify(pageNames)}) {
      const response = await win.fetch('/' + name, { credentials: 'same-origin' });
      out[name] = { status: response.status, html: await response.text() };
    }
    return out;
  })()`);

  const summary = {};
  for (const [name, page] of Object.entries(pages)) {
    if (page.status !== 200 || !page.html || page.html.length < 200) {
      summary[name] = { status: page.status, length: page.html ? page.html.length : 0 };
      continue;
    }
    const dir = new URL(`../device-pages/${name.replace('.html', '')}-${label}/`, import.meta.url);
    await mkdir(dir, { recursive: true });
    await writeFile(new URL('page.html', dir), page.html);
    await writeFile(new URL('source.txt', dir), `Read-only GET: ${base}/${name}\n`);

    // Non-secret DOM facts, computed in Node from the saved HTML via regex-free parsing
    // in the page context would be circular; do a light parse here instead.
    summary[name] = { status: page.status, length: page.html.length, saved: true };
  }

  // DOM facts from the live EN page rendered in a detached document inside the browser.
  const facts = await evaluate(`(() => {
    const frame = document.querySelector('iframe');
    const win = frame && frame.contentWindow ? frame.contentWindow : window;
    return win.fetch('/eims_settings_en.html', { credentials: 'same-origin' })
      .then((r) => r.text())
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const selects = Array.from(doc.querySelectorAll('select')).map((s) => ({
          id: s.id || null,
          name: s.getAttribute('name'),
          options: Array.from(s.options).map((o) => ({ value: o.value, text: o.textContent.trim() })),
          rowId: s.closest('tr') ? (s.closest('tr').id || null) : null
        }));
        const inputs = Array.from(doc.querySelectorAll('input')).map((i) => ({
          id: i.id || null,
          name: i.getAttribute('name'),
          type: i.type,
          value: i.type === 'password' ? (i.value ? '<filled>' : '<empty>') : i.value,
          rowId: i.closest('tr') ? (i.closest('tr').id || null) : null
        }));
        const forms = Array.from(doc.querySelectorAll('form')).map((f) => ({
          id: f.id || null,
          name: f.getAttribute('name'),
          action: f.getAttribute('action'),
          onsubmit: f.getAttribute('onsubmit')
        }));
        const bodyText = doc.body ? doc.body.textContent.replace(/\\s+/g, ' ').slice(0, 400) : '';
        const scripts = Array.from(doc.querySelectorAll('script')).map((s) => s.getAttribute('src')).filter(Boolean);
        const inlineHints = Array.from(doc.querySelectorAll('script:not([src])'))
          .map((s) => s.textContent)
          .join('\\n')
          .split('\\n')
          .filter((line) => /reboot|save|eims|status/i.test(line))
          .map((line) => line.trim().slice(0, 160))
          .slice(0, 40);
        return { selects, inputs, forms, bodyText, scripts, inlineHints };
      });
  })()`);

  console.log(JSON.stringify({ base, label, summary, facts }, null, 2));
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
}
