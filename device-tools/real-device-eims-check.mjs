// Real-device read-only check: open the EIMS module from the assistant panel on a live
// device and report what the EIMS workspace shows. Navigation only — the real form is
// never filled, nothing is submitted, and the device is never saved/rebooted.
// On firmware where the EIMS menu entry is hidden for this account (MenuOff), the script
// falls back to opening eims_settings_en.html directly in the real right frame; the
// controller attaches by page recognition either way.
// Credentials come from env vars and are never persisted.
// Usage: SKYLINE_DEVICE_USER=... SKYLINE_DEVICE_PASS=... node real-device-eims-check.mjs [cdpPort] [baseUrl]
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

const eimsStateExpression = `(() => {
  const host = document.querySelector('#skyline-page-assistant-host');
  const shadow = host && host.shadowRoot;
  const frame = (() => {
    const iframe = Array.from(document.querySelectorAll('iframe')).find((f) => /mainindex_/.test(f.src));
    const doc = iframe && iframe.contentDocument;
    const right = doc && doc.querySelector('frame[name="right"]');
    try { return right && right.contentDocument ? right.contentDocument.location.pathname : (right && right.src) || null; }
    catch (error) { return 'inaccessible: ' + error.message; }
  })();
  const workspace = shadow && shadow.getElementById('eims-workspace');
  return {
    rightFrame: frame,
    workspaceVisible: !!(workspace && !workspace.hidden),
    currentValue: shadow ? (shadow.getElementById('eims-current-value') || {}).textContent : null,
    currentLine: shadow ? (shadow.getElementById('eims-current') || {}).textContent : null,
    stepTitle: shadow ? (shadow.getElementById('eims-step-title') || {}).textContent : null,
    result: shadow ? (shadow.getElementById('result') || {}).textContent : null,
    panelFormRemoved: shadow ? (!shadow.getElementById('eims-server') && !shadow.getElementById('eims-password')) : null
  };
})()`;

function navigateRightFrame(path) {
  return `
    (() => {
      const iframe = Array.from(document.querySelectorAll('iframe')).find((f) => /mainindex_/.test(f.src));
      const right = iframe && iframe.contentDocument && iframe.contentDocument.querySelector('frame[name="right"]');
      if (!right) return false;
      right.contentWindow.location.href = ${JSON.stringify(path)};
      return true;
    })()
  `;
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

  // Wait for the panel, then open the EIMS module through the real panel button.
  let hostReady = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    hostReady = await evaluate(`!!(document.querySelector('#skyline-page-assistant-host')
      && document.querySelector('#skyline-page-assistant-host').shadowRoot
      && document.querySelector('#skyline-page-assistant-host').shadowRoot.querySelector('[data-module-id="eims-settings"]'))`);
    if (hostReady) break;
    await sleep(500);
  }
  if (!hostReady) {
    const diagnostic = await evaluate(`({
      url: location.href,
      readyState: document.readyState,
      hasAccount: !!document.getElementById('accountID'),
      hosts: document.querySelectorAll('#skyline-page-assistant-host').length
    })`);
    throw new Error(`Panel EIMS button never appeared: ${JSON.stringify(diagnostic)}`);
  }

  await evaluate(`
    document.querySelector('#skyline-page-assistant-host').shadowRoot
      .querySelector('[data-module-id="eims-settings"]').click();
  `);
  await sleep(3000);

  // Some accounts hide the EIMS menu entry (MenuOff): the panel click then cannot
  // navigate. Fall back to opening the real page directly in the right frame.
  let eimsState = null;
  let usedDirectNavigation = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    eimsState = await evaluate(eimsStateExpression);
    if (eimsState.workspaceVisible && eimsState.currentValue && !/正在读取/.test(eimsState.currentValue)) break;
    if (attempt === 4 && !/eims_settings/.test(String(eimsState.rightFrame))) {
      usedDirectNavigation = await evaluate(navigateRightFrame('eims_settings_en.html'));
    }
    await sleep(700);
  }

  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(new URL('./real-device-eims-check.png', import.meta.url), Buffer.from(screenshot.data, 'base64'));

  // Leave to another module and come back (direct navigation again if the menu is
  // hidden): the workspace must re-attach and keep syncing the page status.
  await evaluate(`
    document.querySelector('#skyline-page-assistant-host').shadowRoot
      .querySelector('[data-module-id="etms-registration"]').click();
  `);
  await sleep(3000);
  const leftState = await evaluate(eimsStateExpression);
  await evaluate(`
    document.querySelector('#skyline-page-assistant-host').shadowRoot
      .querySelector('[data-module-id="eims-settings"]').click();
  `);
  await sleep(2000);
  let returnedState = await evaluate(eimsStateExpression);
  if (!/eims_settings/.test(String(returnedState.rightFrame))) {
    await evaluate(navigateRightFrame('eims_settings_en.html'));
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    returnedState = await evaluate(eimsStateExpression);
    if (returnedState.workspaceVisible && returnedState.currentValue && !/正在读取/.test(returnedState.currentValue)) break;
    await sleep(700);
  }

  console.log(JSON.stringify({ base, usedDirectNavigation, eimsState, leftState, returnedState, events: events.slice(0, 20) }, null, 2));
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
}
