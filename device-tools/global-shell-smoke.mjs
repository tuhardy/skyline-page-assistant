import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

const port = process.argv[2] || '9334';
const project = 'C:\\Users\\EDY\\Desktop\\sk基本操作\\skyline-page-assistant';
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
const pages = {
  '/main_cn.html': '<!doctype html><html><head><meta charset="utf-8"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style></head><body><iframe src="mainindex_cn.html"></iframe></body></html>',
  '/mainindex_cn.html': `<!doctype html><html><frameset cols="*,1050,*"><frame src="about:blank"><frameset rows="96,*"><frame src="about:blank"><frameset cols="190,*"><frame name="left" src="main_left_cn.html"><frame name="right" src="initial_config_cn.html"></frameset></frameset><frame src="about:blank"></frameset></html>`,
  '/main_left_cn.html': leftPage,
  '/initial_config_cn.html': '<!doctype html><html><body>Initial configuration</body></html>',
  '/goip_imei_cn.html': imeiPage
};
menuPages.filter((page) => page !== 'goip_imei').forEach((page) => {
  pages[`/${page}_cn.html`] = `<!doctype html><html><body>${page}</body></html>`;
});

const server = http.createServer((request, response) => {
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
async function waitFor(expression) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
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
  await evaluate(await readFile(`${project}\\core\\modules.js`, 'utf8'));
  await evaluate(await readFile(`${project}\\core\\device-profile.js`, 'utf8'));
  await evaluate(await readFile(`${project}\\content\\panel.js`, 'utf8'));
  await evaluate(`
    globalThis.__profilePreference = 'auto';
    globalThis.chrome = { runtime: {
      lastError: null,
      sendMessage(message, callback) {
        if (message.type === 'skyline.profile.get') callback({ ok: true, value: globalThis.__profilePreference });
        else if (message.type === 'skyline.profile.set') {
          globalThis.__profilePreference = message.value;
          callback({ ok: true, value: message.value });
        } else callback({ ok: true, value: null });
      },
      onMessage: { addListener() {} }
    }};
    document.querySelectorAll('#skyline-page-assistant-host').forEach((host) => host.remove());
  `);
  await evaluate(await readFile(`${project}\\content\\controller.js`, 'utf8'));
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 9`);
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
    const left = document.querySelector('iframe').contentDocument.querySelector('frame[name="left"]').contentDocument;
    left.querySelectorAll('a[target="right"]').forEach((link) => {
      if (['eims_settings_cn.html', 'goip_sms_ctl_cn.html'].includes(link.getAttribute('href'))) link.closest('li').classList.add('MenuOff');
    });
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 6 && ${shadow}.getElementById('profile-status').textContent === '自动：语音设备'`);
  const automaticVoice = await evaluate(`(() => ({
    modules: ${shadow}.querySelectorAll('[data-module-id]').length,
    smsEntries: ${shadow}.querySelectorAll('[data-module-id="etms-registration"], [data-module-id="eims-settings"], [data-module-id="sms-control"]').length,
    voiceEntries: ${shadow}.querySelectorAll('[data-module-id="call-duration"], [data-module-id="call-count"], [data-module-id="talk-numbers"], [data-module-id="call-control"]').length,
    status: ${shadow}.getElementById('profile-status').textContent
  }))()`);

  await evaluate(`(() => {
    const left = document.querySelector('iframe').contentDocument.querySelector('frame[name="left"]').contentDocument;
    left.querySelectorAll('a[target="right"]').forEach((link) => link.closest('li').classList.add('MenuOff'));
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 2 && ${shadow}.getElementById('profile-status').textContent === '自动：未识别'`);
  const unknownFallback = await evaluate(`(() => ({
    ids: Array.from(${shadow}.querySelectorAll('[data-module-id]'), (button) => button.dataset.moduleId),
    status: ${shadow}.getElementById('profile-status').textContent
  }))()`);

  await evaluate(`(() => {
    const select = ${shadow}.getElementById('profile-preference');
    select.value = 'voice';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 6 && globalThis.__profilePreference === 'voice'`);
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
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 9 && globalThis.__profilePreference === 'sms'`);
  const manualSms = await evaluate(`(() => ({
    modules: ${shadow}.querySelectorAll('[data-module-id]').length,
    status: ${shadow}.getElementById('profile-status').textContent,
    saved: globalThis.__profilePreference
  }))()`);

  await evaluate(`(() => {
    const left = document.querySelector('iframe').contentDocument.querySelector('frame[name="left"]').contentDocument;
    left.querySelectorAll('a[target="right"]').forEach((link) => link.closest('li').classList.remove('MenuOff'));
    const select = ${shadow}.getElementById('profile-preference');
    select.value = 'auto';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`${shadow}.querySelectorAll('[data-module-id]').length === 9 && ${shadow}.getElementById('profile-status').textContent === '自动：短信设备' && globalThis.__profilePreference === 'auto'`);
  const restoredAuto = await evaluate(`(() => ({
    modules: ${shadow}.querySelectorAll('[data-module-id]').length,
    status: ${shadow}.getElementById('profile-status').textContent,
    saved: globalThis.__profilePreference
  }))()`);

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

  await evaluate(`${shadow}.querySelector('[data-module-id="eims-settings"]').click()`);
  await waitFor(`${rightPath} === '/eims_settings_cn.html'`);
  const navigation = await evaluate(`(() => ({
    path: ${rightPath},
    homeVisible: !${shadow}.getElementById('module-home').hidden,
    active: ${shadow}.querySelector('[data-module-id="eims-settings"]').classList.contains('active')
  }))()`);

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
  assert.equal(initial.modules, 9);
  assert.equal(initial.profile, '自动：短信设备', '双菜单设备应根据真实 SMS 菜单识别为短信设备，即使菜单默认折叠');
  assert.equal(initial.preference, 'auto');
  assert.deepEqual(automaticVoice, { modules: 6, smsEntries: 0, voiceEntries: 4, status: '自动：语音设备' });
  assert.deepEqual(unknownFallback, { ids: ['imei', 'save-reboot'], status: '自动：未识别' });
  assert.deepEqual(manualVoice, { modules: 6, status: '手动：语音设备', saved: 'voice' });
  assert.deepEqual(manualSms, { modules: 9, status: '手动：短信设备', saved: 'sms' });
  assert.deepEqual(restoredAuto, { modules: 9, status: '自动：短信设备', saved: 'auto' });
  assert.equal(initial.viewportWidth, 1600);
  assert.ok(initial.panelRight <= initial.viewportWidth && initial.panelRight >= initial.viewportWidth - 40, '面板必须位于顶层视口右侧空白边缘');
  assert.deepEqual(imeiAttached, { path: '/goip_imei_cn.html', ports: 1, homeHidden: true });
  assert.equal(guarded.workspaceVisible, true, '未提交预览时不得离开工作区');
  assert.equal(guarded.previewVisible, true, '被阻止切换时预览必须保留');
  assert.match(guarded.message, /尚未完成/);
  assert.deepEqual(attemptedNavigation, { path: '/goip_imei_cn.html', homeVisible: true }, '已尝试 Submit 后应允许保留待回读记录并切换页面');
  assert.deepEqual(etmsNavigation, { path: '/user_management_cn.html', active: true, moduleName: 'ETMS 注册' });
  assert.deepEqual(navigation, { path: '/eims_settings_cn.html', homeVisible: true, active: true });
  assert.equal(reboot.path, '/eims_settings_cn.html', 'Save/Reboot 指导不得自动导航或重启');
  assert.equal(reboot.submenuVisible, true, '应展开真实保存重启菜单');
  assert.match(reboot.badge, /^第 1 步 · .*Save and Reboot/);
  assert.match(reboot.message, /不会自动点击或自动重启/);
  console.log(JSON.stringify({ initial, automaticVoice, unknownFallback, manualVoice, manualSms, restoredAuto, imeiAttached, guarded, attemptedNavigation, etmsNavigation, navigation, reboot, screenshot: screenshotPath }, null, 2));
  console.log('PASS: 设备识别与手动切换、ETMS 独立导航、全局操作、预览保护和保存重启仅定位均符合预期。');
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
  await new Promise((resolve) => server.close(resolve));
}
