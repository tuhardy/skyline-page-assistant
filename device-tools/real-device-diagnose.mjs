// Real-device read-only diagnosis: open a SKYLINE main page in a browser that has the
// extension loaded, log in with the device account supplied via env vars, then report
// whether the assistant panel appears and what the extension's content-script world did.
// Usage: SKYLINE_DEVICE_USER=... SKYLINE_DEVICE_PASS=... node real-device-diagnose.mjs [cdpPort] [baseUrl]
// Credentials are never written to disk; the screenshot and console output stay local.
import { writeFile } from 'node:fs/promises';

const port = process.argv[2] || '9334';
const base = (process.argv[3] || 'http://192.168.90.246').replace(/\/$/, '');
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
const events = [];
const contexts = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.executionContextCreated') {
    const ctx = message.params.context;
    contexts.push({ name: ctx.name, origin: ctx.origin, auxData: ctx.auxData && ctx.auxData.type });
  } else if (message.method === 'Runtime.exceptionThrown') {
    const d = message.params.exceptionDetails;
    events.push({
      kind: 'exception',
      text: d.text,
      description: d.exception && d.exception.description
        ? String(d.exception.description).slice(0, 400) : undefined,
      url: d.url,
      line: d.lineNumber
    });
  } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type !== 'log') {
    events.push({
      kind: `console.${message.params.type}`,
      text: message.params.args.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ').slice(0, 300)
    });
  } else if (message.method === 'Log.entryAdded') {
    const entry = message.params.entry;
    if (entry.level !== 'verbose') {
      events.push({ kind: `log.${entry.level}`, text: String(entry.text).slice(0, 300), url: entry.url });
    }
  }
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
  await call('Log.enable');

  // Wait for the initial navigation (may land on login page).
  await sleep(3000);
  let url = await evaluate('location.href');
  const loginState = await evaluate(`({
    url: location.href,
    hasAccount: !!document.getElementById('accountID'),
    hasPassword: !!document.getElementById('passwordID'),
    hasSubmit: typeof submitData === 'function'
  })`);
  if (loginState.hasAccount && loginState.hasPassword) {
    await evaluate(`
      document.getElementById('accountID').value = ${JSON.stringify(username)};
      document.getElementById('passwordID').value = ${JSON.stringify(password)};
      submitData();
    `);
    await sleep(4000);
    url = await evaluate('location.href');
  }

  // Wait for the assistant host to appear (content scripts run at document_idle).
  const timeline = [];
  let hostSeen = false;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const state = await evaluate(`({
      url: location.href,
      ready: document.readyState,
      hasHost: !!document.querySelector('#skyline-page-assistant-host'),
      frames: Array.from(document.querySelectorAll('iframe,frame')).map((f) => f.src || f.name).slice(0, 6)
    })`);
    timeline.push(state);
    if (state.hasHost) { hostSeen = true; break; }
    await sleep(500);
  }

  const panel = await evaluate(`(() => {
    const host = document.querySelector('#skyline-page-assistant-host');
    if (!host) return { hasHost: false };
    const shadow = host.shadowRoot;
    if (!shadow) return { hasHost: true, hasShadow: false };
    const text = (shadow.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 600);
    const moduleButtons = Array.from(shadow.querySelectorAll('[data-module]'))
      .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim()).slice(0, 20);
    return { hasHost: true, hasShadow: true, text, moduleButtons };
  })()`);

  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  const shotPath = new URL('./real-device-diagnose.png', import.meta.url);
  await writeFile(shotPath, Buffer.from(screenshot.data, 'base64'));

  console.log(JSON.stringify({
    base,
    finalUrl: url,
    hostSeen,
    timeline: timeline.slice(-3),
    panel,
    extensionContexts: contexts.filter((ctx) => ctx.name && !/^[A-Za-z]*$/.test(ctx.name) || /assistant|SKYLINE/i.test(ctx.name || '')),
    allContextNames: contexts.map((ctx) => ctx.name).slice(0, 20),
    events: events.slice(0, 30)
  }, null, 2));
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
}
