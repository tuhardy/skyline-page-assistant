import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

const port = process.argv[2] || '9334';
const project = 'C:\\Users\\EDY\\Desktop\\sk基本操作\\skyline-page-assistant';
let topModelText = 'MP 664 eSIM V8.5';
let softwareVersion = '';
const menuPages = [
  'goip_imei', 'user_management', 'eims_settings', 'goip_sms_ctl', 'call_dur_ctl',
  'goip_calls_ctl', 'goip_talks_ctl', 'call_ctrl_setting', 'save_reboot'
];
const sections = ['Settings', 'SMS', 'System'].map((name) => `
  <div class="leftMenu">
    <div class="menuHdr" onclick="const sub=this.nextElementSibling;sub.style.display=sub.style.display==='none'?'block':'none'">${name}</div>
    <div class="menuSub" style="display:none">
      ${menuPages.filter((page) => {
        const section = page === 'save_reboot' ? 'System' : ((/^(?:goip_imei|call_dur_ctl|goip_calls_ctl|goip_talks_ctl|call_ctrl_setting)$/.test(page)) ? 'Settings' : 'SMS');
        return section === name;
      }).map((page) => `<li><a href="${page}_cn.html" target="right" onclick="return true">${page}</a></li>`).join('')}
    </div>
  </div>`).join('');
const leftPage = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:12px sans-serif;background:#2b579a;color:white}.leftMenu{margin:10px}.menuHdr{cursor:pointer;font-weight:bold}.menuSub{margin:6px}.menuSub a{display:block;color:white;padding:5px}
.skyline-page-assistant-step-badge{position:fixed}</style></head><body>${sections}</body></html>`;
const imeiPage = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<form id="imeiTypeFormID" name="form1">
<input id="imeiDisplayType0_ID" type="radio" name="imeiDisplayType" value="0" checked>
<table id="ID_TabImeiList"><tbody>
<tr><td><input name="goip_imei(1.01)" value=""></td></tr>
<tr><td><input name="goip_imei(1.02)" value="867383058252281"></td></tr>
</tbody></table>
<span id="ID_SpanCopyImei">
<input type="button" value="复制" onclick="return false"><input type="button" value="清空" onclick="return false"><input type="button" value="自动补全" onclick="return false">
</span><input type="submit" value="提交" onclick="return false"></form></body></html>`;
const etmsPage = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div class="infoBox" id="EjoinRemMgmtBox"><form><div class="infoBoxBody" id="ID_EjoinRemMgmtBox_Body">
<label><input type="radio" value="0" name="ermc_enable" id="ID_ermc_enable0">NONE</label>
<label><input type="radio" value="1" name="ermc_enable" id="ID_ermc_enable1">ERMS</label>
<label><input type="radio" value="2" name="ermc_enable" id="ID_ermc_enable2" checked>ETMS</label>
<input id="ID_erms_ip" name="erms_ip" value="remote.tyhtsf.com">
<input id="ID_erms_port" name="erms_port" value="50000">
<input id="ID_ermc_username" name="ermc_username" value="testeSIM">
<input id="ID_ermc_password" name="ermc_password" type="password" value="">
<div id="ID_TdErmStatus"></div>
<div class="infoBoxBodyBtns"><input type="submit" value="确定" onclick="document.getElementById('ID_TdErmStatus').textContent='OK'; return false;"></div>
</div></form></div></body></html>`;
// 与真实页面一致：form 包裹 #ESN_Box，下拉有 id，服务器/用户名/密码输入框只有 name；
// Submit 后页面不重载、注册状态保持为空（必须保存重启后设备才会渲染状态）。
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
  '/mainindex_cn.html': `<!doctype html><html><frameset cols="*,1050,*"><frame name="top" src="main_top_cn.html"><frameset rows="96,*"><frame src="about:blank"><frameset cols="190,*"><frame name="left" src="main_left_cn.html"><frame name="right" src="initial_config_cn.html"></frameset></frameset><frame src="about:blank"></frameset></html>`,
  '/main_left_cn.html': leftPage,
  '/initial_config_cn.html': '<!doctype html><html><body>Initial configuration</body></html>',
  '/goip_imei_cn.html': imeiPage
};
menuPages.filter((page) => page !== 'goip_imei').forEach((page) => {
  pages[`/${page}_cn.html`] = `<!doctype html><html><body>${page}</body></html>`;
});
pages['/user_management_cn.html'] = etmsPage;
pages['/eims_settings_cn.html'] = eimsPage;

const server = http.createServer((request, response) => {
  if (request.url === '/main_top_cn.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><body><div class="top_info_link">${topModelText}</div></body></html>`);
    return;
  }
  if (request.url === '/get_parameter.html') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ dev_info: { sw_ver: softwareVersion } }));
    return;
  }
  const body = pages[request.url];
  if (!body) {
    response.writeHead(404).end();
    return;
  }
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
    try {
      if (await evaluate(expression)) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${expression}`);
}
const shadow = `document.querySelector('#skyline-page-assistant-host').shadowRoot`;
const rightPath = `document.querySelector('iframe').contentDocument.querySelector('frame[name="right"]').contentWindow.location.pathname`;

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
    globalThis.__pending = {};
    globalThis.chrome = { runtime: {
      lastError: null,
      sendMessage(message, callback) {
        if (message.type === 'skyline.profile.get') callback({ ok: true, value: globalThis.__profilePreference });
        else if (message.type === 'skyline.profile.set') {
          globalThis.__profilePreference = message.value;
          callback({ ok: true, value: message.value });
        } else if (message.type === 'skyline.pending.get') callback({ ok: true, value: globalThis.__pending[message.key] });
        else if (message.type === 'skyline.pending.set') {
          globalThis.__pending[message.key] = message.value;
          callback({ ok: true, value: message.value });
        } else if (message.type === 'skyline.pending.remove') {
          delete globalThis.__pending[message.key];
          callback({ ok: true, value: null });
        } else callback({ ok: true, value: null });
      },
      onMessage: { addListener() {} }
    }};
    document.querySelectorAll('#skyline-page-assistant-host').forEach((host) => host.remove());
  `);
  await evaluate(await readFile(`${project}\\content\\controller.js`, 'utf8'));
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 5 && ${shadow}.getElementById('profile-status').textContent === '自动：短信设备（MP）'`);
  const initial = await evaluate(`(() => ({
    hosts: document.querySelectorAll('#skyline-page-assistant-host').length,
    homeVisible: !${shadow}.getElementById('module-home').hidden,
    imeiHidden: ${shadow}.getElementById('imei-workspace').hidden,
    modules: ${shadow}.querySelectorAll('[data-module-id]').length,
    profile: ${shadow}.getElementById('profile-status').textContent,
    preference: ${shadow}.getElementById('profile-preference').value,
    panelRight: Math.round(document.querySelector('#skyline-page-assistant-host').getBoundingClientRect().right),
    viewportWidth: innerWidth
  }))()`);
  const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const screenshotPath = 'C:\\Users\\EDY\\Desktop\\sk基本操作\\device-tools\\global-shell-home.png';
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  await evaluate(`(() => {
    const top = document.querySelector('iframe').contentDocument.querySelector('frame[name="top"]').contentDocument;
    top.querySelector('.top_info_link').textContent = 'sk GoIP16/512 Version: 6.9x';
    const left = document.querySelector('iframe').contentDocument.querySelector('frame[name="left"]').contentDocument;
    left.querySelectorAll('a[target="right"]').forEach((link) => {
      if (['eims_settings_cn.html', 'goip_sms_ctl_cn.html'].includes(link.getAttribute('href'))) link.closest('li').classList.add('MenuOff');
    });
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 9 && ${shadow}.getElementById('profile-status').textContent === '自动：语音设备（GoIP）'`);
  const automaticVoice = await evaluate(`(() => ({
    modules: ${shadow}.querySelectorAll('[data-module-id]').length,
    smsEntries: ${shadow}.querySelectorAll('[data-module-id="etms-registration"], [data-module-id="eims-settings"], [data-module-id="sms-control"]').length,
    voiceEntries: ${shadow}.querySelectorAll('[data-module-id="call-duration"], [data-module-id="call-count"], [data-module-id="talk-numbers"], [data-module-id="call-control"]').length,
    status: ${shadow}.getElementById('profile-status').textContent
  }))()`);

  softwareVersion = '516-609-924-941-100-000';
  await evaluate(`(() => {
    const top = document.querySelector('iframe').contentDocument.querySelector('frame[name="top"]').contentDocument;
    top.querySelector('.top_info_link').textContent = 'TOP 192.168.90.242';
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 9 && ${shadow}.getElementById('profile-status').textContent === '自动：语音设备（516）'`);
  const softwareFallback = await evaluate(`(() => ({
    modules: ${shadow}.querySelectorAll('[data-module-id]').length,
    status: ${shadow}.getElementById('profile-status').textContent
  }))()`);

  await evaluate(`(() => {
    const select = ${shadow}.getElementById('profile-preference');
    select.value = 'voice';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 9 && globalThis.__profilePreference === 'voice'`);
  const manualVoice = await evaluate(`(() => ({
    modules: ${shadow}.querySelectorAll('[data-module-id]').length,
    status: ${shadow}.getElementById('profile-status').textContent,
    saved: globalThis.__profilePreference
  }))()`);

  await evaluate(`(() => {
    const select = ${shadow}.getElementById('profile-preference');
    select.value = 'sms';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 5 && globalThis.__profilePreference === 'sms'`);
  const manualSms = await evaluate(`(() => ({
    modules: ${shadow}.querySelectorAll('[data-module-id]').length,
    status: ${shadow}.getElementById('profile-status').textContent,
    saved: globalThis.__profilePreference
  }))()`);

  await evaluate(`(() => {
    const top = document.querySelector('iframe').contentDocument.querySelector('frame[name="top"]').contentDocument;
    top.querySelector('.top_info_link').textContent = 'MP 664 eSIM V8.5';
    const left = document.querySelector('iframe').contentDocument.querySelector('frame[name="left"]').contentDocument;
    left.querySelectorAll('a[target="right"]').forEach((link) => link.closest('li').classList.remove('MenuOff'));
    const select = ${shadow}.getElementById('profile-preference');
    select.value = 'auto';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 5 && ${shadow}.getElementById('profile-status').textContent === '自动：短信设备（MP）' && globalThis.__profilePreference === 'auto'`);
  const restoredAuto = await evaluate(`(() => ({
    modules: ${shadow}.querySelectorAll('[data-module-id]').length,
    status: ${shadow}.getElementById('profile-status').textContent,
    saved: globalThis.__profilePreference
  }))()`);

  softwareVersion = '';
  await evaluate(`(() => {
    const top = document.querySelector('iframe').contentDocument.querySelector('frame[name="top"]').contentDocument;
    top.querySelector('.top_info_link').textContent = 'TOP 192.168.90.242';
    const left = document.querySelector('iframe').contentDocument.querySelector('frame[name="left"]').contentDocument;
    left.querySelectorAll('a[target="right"]').forEach((link) => link.closest('li').classList.add('MenuOff'));
    const select = ${shadow}.getElementById('profile-preference');
    select.value = 'voice';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.value = 'auto';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 9 && ${shadow}.getElementById('profile-status').textContent === '自动：未识别' && globalThis.__profilePreference === 'auto'`);
  const unknownFallback = await evaluate(`(() => ({
    ids: Array.from(${shadow}.querySelectorAll('[data-module-id]'), (button) => button.dataset.moduleId),
    status: ${shadow}.getElementById('profile-status').textContent
  }))()`);

  await evaluate(`(() => {
    const top = document.querySelector('iframe').contentDocument.querySelector('frame[name="top"]').contentDocument;
    top.querySelector('.top_info_link').textContent = 'MP 664 eSIM V8.5';
    const left = document.querySelector('iframe').contentDocument.querySelector('frame[name="left"]').contentDocument;
    left.querySelectorAll('a[target="right"]').forEach((link) => link.closest('li').classList.remove('MenuOff'));
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 5 && ${shadow}.getElementById('profile-status').textContent === '自动：短信设备（MP）'`);

  await evaluate(`${shadow}.querySelector('[data-module-id="imei"]').click()`);
  await waitFor(`${rightPath} === '/goip_imei_cn.html' && !${shadow}.getElementById('imei-workspace').hidden`);
  const imeiAttached = await evaluate(`(() => ({
    path: ${rightPath},
    ports: ${shadow}.getElementById('port-select').options.length,
    homeHidden: ${shadow}.getElementById('module-home').hidden
  }))()`);

  await evaluate(`
    ${shadow}.getElementById('imei-input').value = '86738305825352';
    ${shadow}.getElementById('change-form').requestSubmit();
    ${shadow}.getElementById('back-modules').click();
  `);
  const guarded = await evaluate(`(() => ({
    workspaceVisible: !${shadow}.getElementById('imei-workspace').hidden,
    previewVisible: !${shadow}.getElementById('preview').hidden,
    message: ${shadow}.getElementById('result').textContent
  }))()`);
  await evaluate(`${shadow}.getElementById('cancel-preview').click()`);
  await evaluate(`
    ${shadow}.getElementById('change-form').requestSubmit();
    ${shadow}.getElementById('execute-button').click();
  `);
  await waitFor(`${shadow}.getElementById('result').textContent.includes('正在点击真实 Submit')`);
  await evaluate(`${shadow}.getElementById('back-modules').click()`);
  await waitFor(`!${shadow}.getElementById('module-home').hidden`);
  const attemptedNavigation = await evaluate(`(() => ({
    path: ${rightPath},
    homeVisible: !${shadow}.getElementById('module-home').hidden
  }))()`);

  await evaluate(`${shadow}.querySelector('[data-module-id="etms-registration"]').click()`);
  await waitFor(`${rightPath} === '/user_management_cn.html'`);
  const etmsNavigation = await evaluate(`(() => ({
    path: ${rightPath},
    active: ${shadow}.querySelector('[data-module-id="etms-registration"]').classList.contains('active'),
    moduleName: ${shadow}.querySelector('[data-module-id="etms-registration"] strong').textContent
  }))()`);
  await waitFor(`${shadow}.getElementById('etms-workspace').hidden === false && ${shadow}.getElementById('etms-current').textContent.includes('remote.tyhtsf.com:50000')`);
  const etmsAttached = await evaluate(`(() => ({
    workspaceVisible: !${shadow}.getElementById('etms-workspace').hidden,
    current: ${shadow}.getElementById('etms-current').textContent,
    panelFormRemoved: !${shadow}.getElementById('etms-server') && !${shadow}.getElementById('etms-port')
      && !${shadow}.getElementById('etms-account') && !${shadow}.getElementById('etms-password')
  }))()`);
  // 设备页面异步刷新 ETMS 状态（readErmStatus），工作区应自动同步显示，无需重新附加
  await evaluate(`document.querySelector('iframe').contentDocument.querySelector('frame[name="right"]').contentDocument.getElementById('ID_TdErmStatus').textContent = 'OK'`);
  await waitFor(`${shadow}.getElementById('etms-current').textContent.includes('状态 OK')`);
  const etmsAsyncStatus = await evaluate(`${shadow}.getElementById('etms-current').textContent`);
  // 真实密码框为空时，预览必须失败且不显示预览；密码只能在真实表单填写
  await evaluate(`${shadow}.getElementById('etms-preview-button').click()`);
  await waitFor(`${shadow}.getElementById('result').textContent.includes('请先在真实表单中填写 ETMS 密码')`);
  const etmsEmptyPassword = await evaluate(`(() => ({
    result: ${shadow}.getElementById('result').textContent,
    previewHidden: ${shadow}.getElementById('etms-preview').hidden
  }))()`);
  // 用户直接在右侧真实表单填写密码，扩展只检查非空、不读取内容
  await evaluate(`(() => {
    const right = document.querySelector('iframe').contentDocument.querySelector('frame[name="right"]').contentDocument;
    right.getElementById('ID_ermc_password').value = 'secret';
  })()`);
  await evaluate(`${shadow}.getElementById('etms-preview-button').click()`);
  await waitFor(`${shadow}.getElementById('etms-preview').hidden === false`);
  const etmsPreview = await evaluate(`(() => ({
    text: ${shadow}.getElementById('etms-preview').textContent,
    passwordLabel: ${shadow}.getElementById('etms-preview-password').textContent
  }))()`);
  await evaluate(`${shadow}.getElementById('etms-execute-button').click()`);
  await waitFor(`${shadow}.getElementById('result').textContent.includes('ETMS 注册状态已回读为 OK')`);
  const etmsResult = await evaluate(`(() => {
    const right = document.querySelector('iframe').contentDocument.querySelector('frame[name="right"]').contentDocument;
    return {
      result: ${shadow}.getElementById('result').textContent,
      pending: globalThis.__pending['skyline.etms.pending'] || null,
      realPasswordKept: right.getElementById('ID_ermc_password').value,
      status: right.getElementById('ID_TdErmStatus').textContent
    };
  })()`);

  // —— EIMS 注册指导：真实表单直填，提交后必须保存重启才能看到注册状态 ——
  await evaluate(`${shadow}.querySelector('[data-module-id="eims-settings"]').click()`);
  await waitFor(`${rightPath} === '/eims_settings_cn.html'`);
  const eimsNavigation = await evaluate(`(() => ({
    path: ${rightPath},
    active: ${shadow}.querySelector('[data-module-id="eims-settings"]').classList.contains('active'),
    moduleName: ${shadow}.querySelector('[data-module-id="eims-settings"] strong').textContent
  }))()`);
  await waitFor(`${shadow}.getElementById('eims-workspace').hidden === false && ${shadow}.getElementById('eims-current').textContent.includes('NONE')`);
  const eimsAttached = await evaluate(`(() => ({
    workspaceVisible: !${shadow}.getElementById('eims-workspace').hidden,
    current: ${shadow}.getElementById('eims-current').textContent,
    panelFormRemoved: !${shadow}.getElementById('eims-server') && !${shadow}.getElementById('eims-password')
  }))()`);
  // 真实表单服务器类型仍为 NONE 时，预览必须失败并提示选择 EIMS
  await evaluate(`${shadow}.getElementById('eims-preview-button').click()`);
  await waitFor(`${shadow}.getElementById('result').textContent.includes('EIMS') && ${shadow}.getElementById('result').textContent.includes('类型')`);
  const eimsWrongType = await evaluate(`(() => ({
    result: ${shadow}.getElementById('result').textContent,
    previewHidden: ${shadow}.getElementById('eims-preview').hidden
  }))()`);
  // 用户直接在右侧真实表单选择 EIMS 并填写；密码框为空时预览必须失败
  await evaluate(`(() => {
    const right = document.querySelector('iframe').contentDocument.querySelector('frame[name="right"]').contentDocument;
    right.getElementById('ID_esn_server_type').value = '1';
    right.querySelector('[name="esn_server"]').value = 'eims.example.com';
    right.querySelector('[name="esn_username"]').value = 'eimsUser';
  })()`);
  await evaluate(`${shadow}.getElementById('eims-preview-button').click()`);
  await waitFor(`${shadow}.getElementById('result').textContent.includes('请先在真实表单中填写 EIMS 密码')`);
  const eimsEmptyPassword = await evaluate(`(() => ({
    result: ${shadow}.getElementById('result').textContent,
    previewHidden: ${shadow}.getElementById('eims-preview').hidden
  }))()`);
  await evaluate(`(() => {
    const right = document.querySelector('iframe').contentDocument.querySelector('frame[name="right"]').contentDocument;
    right.querySelector('[name="esn_password"]').value = 'secret';
  })()`);
  await evaluate(`${shadow}.getElementById('eims-preview-button').click()`);
  await waitFor(`${shadow}.getElementById('eims-preview').hidden === false`);
  const eimsPreview = await evaluate(`(() => ({
    text: ${shadow}.getElementById('eims-preview').textContent,
    protocol: ${shadow}.getElementById('eims-preview-protocol').textContent,
    passwordLabel: ${shadow}.getElementById('eims-preview-password').textContent
  }))()`);
  await evaluate(`${shadow}.getElementById('eims-execute-button').click()`);
  // 提交后注册状态仍为空：首次回读必须进入"等待保存重启"，待回读记录必须保留并计划低频重读
  await waitFor(`${shadow}.getElementById('result').textContent.includes('表单已提交保存。EIMS 注册状态必须保存并重启设备后才会显示')`);
  const eimsAwaitingReboot = await evaluate(`(() => ({
    result: ${shadow}.getElementById('result').textContent,
    pending: globalThis.__pending['skyline.eims.pending'] || null,
    step: ${shadow}.getElementById('eims-step-title').textContent
  }))()`);
  // 模拟设备完成保存重启：状态行出现 OK，低频重读应确认成功并清除记录
  await evaluate(`document.querySelector('iframe').contentDocument.querySelector('frame[name="right"]').contentDocument.getElementById('ID_TdEsnStatus').textContent = 'OK'`);
  // 第 5 步只定位真实保存重启菜单，不自动重启
  await evaluate(`${shadow}.getElementById('eims-locate').click()`);
  const eimsRebootGuide = await evaluate(`(() => {
    const left = document.querySelector('iframe').contentDocument.querySelector('frame[name="left"]').contentDocument;
    const link = left.querySelector('a[href="save_reboot_cn.html"]');
    return {
      submenuVisible: getComputedStyle(link.closest('.menuSub')).display !== 'none',
      message: ${shadow}.getElementById('result').textContent
    };
  })()`);
  await waitFor(`${shadow}.getElementById('result').textContent.includes('EIMS 注册状态已回读为 OK')`, 200);
  const eimsResult = await evaluate(`(() => {
    const right = document.querySelector('iframe').contentDocument.querySelector('frame[name="right"]').contentDocument;
    return {
      result: ${shadow}.getElementById('result').textContent,
      pending: globalThis.__pending['skyline.eims.pending'] || null,
      realPasswordKept: right.querySelector('[name="esn_password"]').value,
      status: right.getElementById('ID_TdEsnStatus').textContent
    };
  })()`);

  await evaluate(`${shadow}.querySelector('[data-module-id="save-reboot"]').click()`);
  const reboot = await evaluate(`(() => {
    const left = document.querySelector('iframe').contentDocument.querySelector('frame[name="left"]').contentDocument;
    const link = left.querySelector('a[href="save_reboot_cn.html"]');
    return {
      path: ${rightPath},
      submenuVisible: getComputedStyle(link.closest('.menuSub')).display !== 'none',
      badge: left.querySelector('.skyline-page-assistant-step-badge')?.textContent || '',
      message: ${shadow}.getElementById('result').textContent
    };
  })()`);

  assert.equal(initial.hosts, 1);
  assert.equal(initial.homeVisible, true);
  assert.equal(initial.imeiHidden, true);
  assert.equal(initial.modules, 5);
  assert.equal(initial.profile, '自动：短信设备（MP）', '右上角 MP 型号应优先识别为短信设备');
  assert.equal(initial.preference, 'auto');
  assert.deepEqual(automaticVoice, { modules: 9, smsEntries: 3, voiceEntries: 4, status: '自动：语音设备（GoIP）' });
  assert.deepEqual(softwareFallback, { modules: 9, status: '自动：语音设备（516）' });
  assert.deepEqual(unknownFallback, {
    // 功能表按设备真实菜单位置分组（移动/短信/语音/系统设置），DOM 顺序为分组后的顺序
    ids: ['imei', 'eims-settings', 'sms-control', 'call-duration', 'call-count', 'talk-numbers', 'call-control', 'etms-registration', 'save-reboot'],
    status: '自动：未识别'
  });
  assert.deepEqual(manualVoice, { modules: 9, status: '手动：语音设备', saved: 'voice' });
  assert.deepEqual(manualSms, { modules: 5, status: '手动：短信设备', saved: 'sms' });
  assert.deepEqual(restoredAuto, { modules: 5, status: '自动：短信设备（MP）', saved: 'auto' });
  assert.equal(initial.viewportWidth, 1600);
  assert.ok(initial.panelRight <= initial.viewportWidth && initial.panelRight >= initial.viewportWidth - 40, '面板必须位于顶层视口右侧空白边缘');
  assert.deepEqual(imeiAttached, { path: '/goip_imei_cn.html', ports: 1, homeHidden: true });
  assert.equal(guarded.workspaceVisible, true, '未提交预览时不得离开工作区');
  assert.equal(guarded.previewVisible, true, '被阻止切换时预览必须保留');
  assert.match(guarded.message, /尚未完成/);
  assert.deepEqual(attemptedNavigation, { path: '/goip_imei_cn.html', homeVisible: true }, '已尝试 Submit 后应允许保留待回读记录并切换页面');
  assert.deepEqual(etmsNavigation, { path: '/user_management_cn.html', active: true, moduleName: 'ETMS 注册' });
  assert.equal(etmsAttached.workspaceVisible, true, 'ETMS 页面应进入独立工作区');
  assert.match(etmsAttached.current, /ETMS · remote\.tyhtsf\.com:50000 · testeSIM/);
  assert.equal(etmsAttached.panelFormRemoved, true, '面板不再提供服务/密码等表单字段，全部直接在真实表单填写');
  assert.match(etmsAsyncStatus, /状态 OK/, '页面异步刷新 ETMS 状态后，工作区应自动同步显示，无需重新附加');
  assert.match(etmsEmptyPassword.result, /请先在真实表单中填写 ETMS 密码/);
  assert.equal(etmsEmptyPassword.previewHidden, true, '真实密码框为空时不得生成预览');
  assert.match(etmsPreview.text, /remote\.tyhtsf\.com/);
  assert.match(etmsPreview.text, /testeSIM/);
  assert.doesNotMatch(etmsPreview.text, /secret/, 'ETMS 预览不得显示密码');
  assert.match(etmsPreview.passwordLabel, /已填写/);
  assert.match(etmsPreview.text, /不读取、不显示、不保存/);
  assert.equal(etmsResult.status, 'OK');
  assert.equal(etmsResult.pending, null, 'ETMS 成功回读后应清除待回读记录');
  assert.equal(etmsResult.realPasswordKept, 'secret', '真实表单保持用户填写的内容，扩展不清除密码框');
  assert.match(etmsResult.result, /密码未保存/);
  assert.deepEqual(eimsNavigation, { path: '/eims_settings_cn.html', active: true, moduleName: 'EIMS 注册' });
  assert.equal(eimsAttached.workspaceVisible, true, 'EIMS 页面应进入独立工作区');
  assert.match(eimsAttached.current, /NONE/, '工作区应如实显示真实表单的当前服务器类型');
  assert.equal(eimsAttached.panelFormRemoved, true, '面板不再提供 EIMS 表单字段，全部直接在真实表单填写');
  assert.match(eimsWrongType.result, /EIMS/);
  assert.equal(eimsWrongType.previewHidden, true, '服务器类型不是 EIMS 时不得生成预览');
  assert.match(eimsEmptyPassword.result, /请先在真实表单中填写 EIMS 密码/);
  assert.equal(eimsEmptyPassword.previewHidden, true, '真实密码框为空时不得生成预览');
  assert.match(eimsPreview.text, /eims\.example\.com/);
  assert.match(eimsPreview.text, /eimsUser/);
  assert.equal(eimsPreview.protocol, 'TCP');
  assert.doesNotMatch(eimsPreview.text, /secret/, 'EIMS 预览不得显示密码');
  assert.match(eimsPreview.passwordLabel, /已填写/);
  assert.match(eimsAwaitingReboot.result, /保存并重启/);
  assert.match(eimsAwaitingReboot.result, /5 秒后重读/, '等待保存重启期间应计划低频重读');
  assert.notEqual(eimsAwaitingReboot.pending, null, '等待保存重启期间必须保留待回读记录');
  assert.equal(eimsAwaitingReboot.pending.attempts, 1, '首次空状态回读后应已记录一次重读尝试');
  assert.equal(eimsAwaitingReboot.step, '保存并重启');
  assert.equal(eimsRebootGuide.submenuVisible, true, '第 5 步应展开真实保存重启菜单');
  assert.match(eimsRebootGuide.message, /手动完成保存重启/);
  assert.equal(eimsResult.status, 'OK');
  assert.equal(eimsResult.pending, null, 'EIMS 成功回读后应清除待回读记录');
  assert.equal(eimsResult.realPasswordKept, 'secret', '真实表单保持用户填写的内容，扩展不清除密码框');
  assert.match(eimsResult.result, /不读取、不显示、不保存|密码未保存/);
  assert.equal(reboot.path, '/eims_settings_cn.html', 'Save/Reboot 指导不得自动导航或重启');
  assert.equal(reboot.submenuVisible, true, '应展开真实保存重启菜单');
  assert.match(reboot.badge, /^第 1 步 · .*Save and Reboot/);
  assert.match(reboot.message, /不会自动点击或自动重启/);
  console.log(JSON.stringify({ initial, automaticVoice, softwareFallback, unknownFallback, manualVoice, manualSms, restoredAuto, imeiAttached, guarded, attemptedNavigation, etmsNavigation, etmsAttached, etmsAsyncStatus, etmsEmptyPassword, etmsPreview, etmsResult, eimsNavigation, eimsAttached, eimsWrongType, eimsEmptyPassword, eimsPreview, eimsAwaitingReboot, eimsRebootGuide, eimsResult, reboot, screenshot: screenshotPath }, null, 2));
  console.log('PASS: 设备识别与手动切换、ETMS/EIMS 真实表单直填注册指导/确认后代操作、EIMS 保存重启等待与回读、全局操作、预览保护和保存重启仅定位均符合预期。');
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
  await new Promise((resolve) => server.close(resolve));
}
