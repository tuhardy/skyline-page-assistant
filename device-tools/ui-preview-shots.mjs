import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

const port = process.argv[2] || '9334';
const project = 'C:\\Users\\EDY\\Desktop\\sk基本操作\\skyline-page-assistant';
const outDir = 'C:\\Users\\EDY\\Desktop\\sk基本操作\\device-tools';
const menuPages = [
  'goip_imei', 'user_management', 'eims_settings', 'goip_sms_ctl', 'call_dur_ctl',
  'goip_calls_ctl', 'goip_talks_ctl', 'call_ctrl_setting', 'save_reboot'
];
const sections = ['Settings', 'SMS', 'System'].map((name) => `
  <div class="leftMenu">
    <div class="menuHdr">${name}</div>
    <div class="menuSub">
      ${menuPages.filter((page) => {
        const section = page === 'save_reboot' ? 'System' : ((/^(?:goip_imei|call_dur_ctl|goip_calls_ctl|goip_talks_ctl|call_ctrl_setting)$/.test(page)) ? 'Settings' : 'SMS');
        return section === name;
      }).map((page) => `<li><a href="${page}_cn.html" target="right">${page}</a></li>`).join('')}
    </div>
  </div>`).join('');
const leftPage = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:12px sans-serif;background:#2b579a;color:white}.leftMenu{margin:10px}.menuHdr{font-weight:bold}.menuSub{margin:6px}.menuSub a{display:block;color:white;padding:5px}</style></head><body>${sections}</body></html>`;
const eimsPage = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<form action="" method="post" name="form1"><div class="infoBox" id="ESN_Box"><div class="infoBoxBody" id="ID_ESN_Box_Body">
<table class="inputBox"><tbody>
<tr><td>服务器类型:</td><td><select name="esn_server_type" id="ID_esn_server_type">
<option value="0" selected>NONE</option><option value="1">EIMS</option><option value="2">EMDA</option></select></td></tr>
<tr><td>服务器地址:</td><td><input class="textValue" type="text" name="esn_server" value="" maxlength="64"/></td></tr>
<tr id="esn_ucp_tcp_tr_id"><td>UDP/TCP:</td><td><select name="esn_ucp_tcp" id="ID_esn_ucp_tcp">
<option value="0">UDP</option><option value="1" selected>TCP</option></select></td></tr>
<tr><td>用户名:</td><td><input class="textValue" type="text" name="esn_username" value="" maxlength="64"/></td></tr>
<tr><td>密码:</td><td><input class="textValue" type="password" name="esn_password" value="" maxlength="64"/></td></tr>
<tr><td>注册状态:</td><td id="ID_TdEsnStatus" class="inputValue2"></td></tr>
</tbody></table>
<div class="infoBoxBodyBtns"><input type="submit" value="确定" onclick="return false;"/><input type="reset" value="重置"/></div>
</div></div></form></body></html>`;
const pages = {
  '/main_cn.html': '<!doctype html><html><head><meta charset="utf-8"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style></head><body><iframe src="mainindex_cn.html"></iframe></body></html>',
  '/mainindex_cn.html': '<!doctype html><html><frameset cols="*,1050,*"><frame name="top" src="main_top_cn.html"><frameset rows="96,*"><frame src="about:blank"><frameset cols="190,*"><frame name="left" src="main_left_cn.html"><frame name="right" src="initial_config_cn.html"></frameset></frameset><frame src="about:blank"></frameset></html>',
  '/main_left_cn.html': leftPage,
  '/initial_config_cn.html': '<!doctype html><html><body>Initial configuration</body></html>',
  '/eims_settings_cn.html': eimsPage
};
menuPages.filter((page) => !['eims_settings'].includes(page)).forEach((page) => {
  pages[`/${page}_cn.html`] = `<!doctype html><html><body>${page}</body></html>`;
});
const server = http.createServer((request, response) => {
  if (request.url === '/main_top_cn.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><body><div class="top_info_link">MP 664 eSIM V8.5</div></body></html>');
    return;
  }
  const body = pages[request.url];
  if (!body) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/main_cn.html`;
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
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
async function waitFor(expression, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { if (await evaluate(expression)) return; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function shot(name) {
  const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`${outDir}\\${name}`, Buffer.from(screenshot.data, 'base64'));
  console.log('saved', name);
}
const shadow = `document.querySelector('#skyline-page-assistant-host').shadowRoot`;

try {
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(`document.readyState === 'complete' && document.querySelector('iframe')?.contentDocument?.querySelector('frame[name="right"]')?.contentDocument?.readyState === 'complete'`);
  await evaluate(await readFile(`${project}\\core\\imei.js`, 'utf8'));
  await evaluate(await readFile(`${project}\\core\\etms.js`, 'utf8'));
  await evaluate(await readFile(`${project}\\core\\eims.js`, 'utf8'));
  await evaluate(await readFile(`${project}\\core\\modules.js`, 'utf8'));
  await evaluate(await readFile(`${project}\\core\\device-profile.js`, 'utf8'));
  await evaluate(await readFile(`${project}\\content\\panel.js`, 'utf8'));
  await evaluate(`
    globalThis.__profilePreference = 'auto';
    globalThis.chrome = { runtime: {
      lastError: null,
      sendMessage(message, callback) { callback({ ok: true, value: null }); },
      onMessage: { addListener() {} }
    }};
    document.querySelectorAll('#skyline-page-assistant-host').forEach((host) => host.remove());
  `);
  await evaluate(await readFile(`${project}\\content\\controller.js`, 'utf8'));
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 5`);

  // 1. 展开扇形
  await evaluate(`${shadow}.getElementById('fab').click()`);
  await new Promise((resolve) => setTimeout(resolve, 600));
  await evaluate(`${shadow}.querySelector('.fan-item.utility').dispatchEvent(new MouseEvent('mouseenter'))`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await shot('ui-shot-fan.png');

  // 2. 更多 → 功能表
  await evaluate(`${shadow}.querySelector('.fan-item.utility').click()`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await shot('ui-shot-home.png');

  // 3. 搜索“注册”
  await evaluate(`(() => { const q = ${shadow}.getElementById('module-search'); q.value = '注册'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await shot('ui-shot-search.png');

  // 4. 英文界面
  await evaluate(`(() => { const q = ${shadow}.getElementById('module-search'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await evaluate(`${shadow}.getElementById('lang-en').click()`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await shot('ui-shot-en.png');

  // 5. 扇形固定项直达 EIMS 工作区
  await evaluate(`${shadow}.getElementById('lang-zh').click()`);
  await evaluate(`${shadow}.getElementById('fab').click()`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await evaluate(`${shadow}.querySelectorAll('.fan-item')[2].click()`);
  await waitFor(`${shadow}.getElementById('eims-workspace').hidden === false`);
  await new Promise((resolve) => setTimeout(resolve, 600));
  await shot('ui-shot-eims.png');
} finally {
  socket.close();
  server.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
}
console.log('DONE');
