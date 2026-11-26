// Pinpoint probe: after opening the ETMS page on a live device, run the CURRENT
// core/etms.js (from disk) against the real right-frame document and report exactly
// which selector matches or misses. Read-only; credentials via env vars only.
import { readFile } from 'node:fs/promises';

const port = process.argv[2] || '9334';
const base = (process.argv[3] || 'http://192.168.90.246').replace(/\/$/, '');
const username = process.env.SKYLINE_DEVICE_USER || '';
const password = process.env.SKYLINE_DEVICE_PASS || '';
if (!username || !password) throw new Error('Set SKYLINE_DEVICE_USER and SKYLINE_DEVICE_PASS.');

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
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

try {
  await call('Page.enable');
  await call('Runtime.enable');
  await sleep(3000);
  if (await evaluate('!!document.getElementById("accountID")')) {
    await evaluate(`
      document.getElementById('accountID').value = ${JSON.stringify(username)};
      document.getElementById('passwordID').value = ${JSON.stringify(password)};
      submitData();
    `);
    await sleep(4000);
  }
  // Navigate the right frame straight to the ETMS page (same as the real menu link).
  await evaluate(`
    (() => {
      const iframe = Array.from(document.querySelectorAll('iframe')).find((f) => /mainindex_/.test(f.src));
      const left = iframe.contentDocument.querySelector('frame[name="left"]');
      const link = left.contentDocument.querySelector('a[href="user_management_en.html"]');
      link.click();
    })()
  `);
  await sleep(4000);

  const etmsSource = await readFile('C:\\Users\\EDY\\Desktop\\sk基本操作\\skyline-page-assistant\\core\\etms.js', 'utf8');
  await evaluate(etmsSource);

  const probe = await evaluate(`(() => {
    const iframe = Array.from(document.querySelectorAll('iframe')).find((f) => /mainindex_/.test(f.src));
    const right = iframe.contentDocument.querySelector('frame[name="right"]');
    const doc = right.contentDocument;
    const box = doc.querySelector('#EjoinRemMgmtBox');
    const form = box && box.querySelector('form');
    const pick = (id, name) => box && (box.querySelector('#' + id) || box.querySelector('input[name="' + name + '"]'));
    const current = globalThis.SkylineEtms.readCurrent(doc);
    return {
      rightUrl: doc.location.href,
      readyState: doc.readyState,
      hasBox: !!box,
      hasForm: !!form,
      radioCount: box ? box.querySelectorAll('input[name="ermc_enable"]').length : -1,
      checkedValue: box ? (box.querySelector('input[name="ermc_enable"]:checked') || {}).value ?? null : null,
      serverById: !!(box && box.querySelector('#ID_erms_ip')),
      serverByName: !!(box && box.querySelector('input[name="erms_ip"]')),
      portById: !!(box && box.querySelector('#ID_erms_port')),
      accountById: !!(box && box.querySelector('#ID_ermc_username')),
      accountByName: !!(box && box.querySelector('input[name="ermc_username"]')),
      passwordById: !!(box && box.querySelector('#ID_ermc_password')),
      passwordByName: !!(box && box.querySelector('input[name="ermc_password"]')),
      hasStatus: !!(box && box.querySelector('#ID_TdErmStatus')),
      hasSubmit: !!(form && form.querySelector('.infoBoxBodyBtns input[type="submit"]')),
      readCurrent: current ? { type: current.type, server: current.server, port: current.port, account: current.account, status: current.status, disabled: current.disabled } : null
    };
  })()`);
  console.log(JSON.stringify(probe, null, 2));
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
}
