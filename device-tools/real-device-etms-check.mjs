// Real-device read-only check: open the ETMS module from the assistant panel on a live
// device and report what the ETMS workspace shows. Navigation only — no form is filled
// and nothing is submitted. Credentials come from env vars and are never persisted.
// Usage: SKYLINE_DEVICE_USER=... SKYLINE_DEVICE_PASS=... node real-device-etms-check.mjs [cdpPort] [baseUrl]
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
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const d = message.params.exceptionDetails;
    events.push({
      kind: 'exception',
      text: d.text,
      description: d.exception && d.exception.description
        ? String(d.exception.description).slice(0, 400) : undefined
    });
  } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type !== 'log') {
    events.push({
      kind: `console.${message.params.type}`,
      text: message.params.args.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ').slice(0, 300)
    });
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

  // Wait for the panel, then open the ETMS module through the real panel button.
  let hostReady = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    hostReady = await evaluate(`!!(document.querySelector('#skyline-page-assistant-host')
      && document.querySelector('#skyline-page-assistant-host').shadowRoot
      && document.querySelector('#skyline-page-assistant-host').shadowRoot.querySelector('[data-module-id="etms-registration"]'))`);
    if (hostReady) break;
    await sleep(500);
  }
  if (!hostReady) throw new Error('Panel ETMS button never appeared.');

  await evaluate(`
    document.querySelector('#skyline-page-assistant-host').shadowRoot
      .querySelector('[data-module-id="etms-registration"]').click();
  `);

  // Wait for the right frame to reach user_management and the ETMS workspace to update.
  let etmsState = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    etmsState = await evaluate(`(() => {
      const host = document.querySelector('#skyline-page-assistant-host');
      const shadow = host && host.shadowRoot;
      const frame = (() => {
        const iframe = Array.from(document.querySelectorAll('iframe')).find((f) => /mainindex_/.test(f.src));
        const doc = iframe && iframe.contentDocument;
        const right = doc && doc.querySelector('frame[name="right"]');
        try { return right && right.contentDocument ? right.contentDocument.location.href : (right && right.src) || null; }
        catch (error) { return 'inaccessible: ' + error.message; }
      })();
      const workspace = shadow && shadow.getElementById('etms-workspace');
      return {
        rightFrame: frame,
        workspaceVisible: !!(workspace && !workspace.hidden),
        currentValue: shadow ? (shadow.getElementById('etms-current-value') || {}).textContent : null,
        currentLine: shadow ? (shadow.getElementById('etms-current') || {}).textContent : null,
        result: shadow ? (shadow.getElementById('result') || {}).textContent : null,
        serverInputValue: shadow && shadow.getElementById('etms-server') ? shadow.getElementById('etms-server').value : null,
        passwordValue: shadow && shadow.getElementById('etms-password') ? shadow.getElementById('etms-password').value : null
      };
    })()`);
    if (etmsState.workspaceVisible && etmsState.currentValue && !/正在读取/.test(etmsState.currentValue)) break;
    await sleep(700);
  }

  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(new URL('./real-device-etms-check.png', import.meta.url), Buffer.from(screenshot.data, 'base64'));

  // Leave to another module and come back: the workspace must re-attach and then
  // keep syncing the page's asynchronously refreshed status (not stay blank/stale).
  await evaluate(`
    document.querySelector('#skyline-page-assistant-host').shadowRoot
      .querySelector('[data-module-id="eims-settings"]').click();
  `);
  await sleep(3000);
  await evaluate(`
    document.querySelector('#skyline-page-assistant-host').shadowRoot
      .querySelector('[data-module-id="etms-registration"]').click();
  `);
  let returnedState = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    returnedState = await evaluate(`(() => {
      const shadow = document.querySelector('#skyline-page-assistant-host').shadowRoot;
      return {
        workspaceVisible: !shadow.getElementById('etms-workspace').hidden,
        currentValue: shadow.getElementById('etms-current-value').textContent,
        currentLine: shadow.getElementById('etms-current').textContent
      };
    })()`);
    if (returnedState.workspaceVisible && /状态 (?!空\b)\S+/.test(returnedState.currentValue)) break;
    await sleep(700);
  }

  console.log(JSON.stringify({ base, etmsState, returnedState, events: events.slice(0, 20) }, null, 2));
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
}
