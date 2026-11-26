import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const port = process.argv[2] || '9334';
const project = 'C:\\Users\\EDY\\Desktop\\sk基本操作\\skyline-page-assistant';
const original = '867383058252281';
const prefix = '86738305';
const fixture = `<!doctype html>
<html><head><meta charset="utf-8"><title>Batch processing fixture</title></head>
<body><form id="imeiTypeFormID" name="form1">
<input id="imeiDisplayType0_ID" type="radio" name="imeiDisplayType" value="0" checked>
<table id="ID_TabImeiList"><tbody>
<tr><td><input name="goip_imei(1.01)" value="${original}"></td></tr>
<tr><td><input name="goip_imei(1.02)" value=""></td></tr>
<tr><td><input name="goip_imei(1.03)" value=""></td></tr>
<tr><td><input name="goip_imei(1.04)" value=""></td></tr>
<tr><td><input name="goip_imei(2.01)" value="867383058253529" disabled></td></tr>
</tbody></table>
<span id="ID_SpanCopyImei">
<input type="button" value="复制" onclick="return copyImei('ID_TabImeiList')">
<input type="button" value="清空" onclick="return clearImei('ID_TabImeiList')">
<input type="button" value="自动补全" onclick="return completeImeis('ID_TabImeiList')">
</span>
<input type="submit" value="提交" onclick="return false">
</form></body></html>`;

const server = http.createServer((request, response) => {
  if (request.url !== '/goip_imei_cn.html') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(fixture);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/goip_imei_cn.html`;

async function runMode(scope, initialValues = [original, '', '', '']) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(fixtureUrl)}`, { method: 'PUT' })).json();
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
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await evaluate('document.readyState === "complete" && Boolean(document.querySelector("#ID_TabImeiList"))')) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await evaluate(await readFile(`${project}\\core\\imei.js`, 'utf8'));
    await evaluate(await readFile(`${project}\\core\\modules.js`, 'utf8'));
    await evaluate(await readFile(`${project}\\content\\panel.js`, 'utf8'));
    await evaluate(`
      globalThis.batchCalls = [];
      globalThis.chrome = {
        runtime: {
          lastError: null,
          sendMessage(message, callback) { callback({ ok: true, value: null }); },
          onMessage: { addListener() {} }
        }
      };
      function enabledImeiInputs(id) {
        return Array.from(document.querySelectorAll('#' + id + ' input[name^="goip_imei("]'))
          .filter((element) => !element.disabled);
      }
      globalThis.copyImei = function(id) {
        const inputs = enabledImeiInputs(id);
        const withValues = inputs.filter((element) => element.value !== '');
        if (!withValues.length) return false;
        let value = withValues[0].value;
        inputs.forEach((element) => {
          if (element.value !== '') value = element.value;
          else element.value = value;
        });
        return true;
      };
      globalThis.clearImei = function(id) {
        globalThis.batchCalls.push('clear');
        enabledImeiInputs(id).forEach((element) => { element.value = ''; });
        return true;
      };
      globalThis.completeImeis = function(id) {
        enabledImeiInputs(id).filter((element) => element.value !== '').forEach((element) => {
          const firstFourteen = (element.value + '00000000000000').slice(0, 14);
          element.value = firstFourteen + SkylineImei.imeiCheckDigit(firstFourteen);
        });
        return true;
      };
    `);
    await evaluate(`
      ${JSON.stringify(initialValues)}.forEach((value, index) => {
        document.querySelectorAll('input[name^="goip_imei("]')[index].value = value;
      });
      document.querySelectorAll('#skyline-page-assistant-host').forEach((host) => host.remove());
    `);
    await evaluate(await readFile(`${project}\\content\\controller.js`, 'utf8'));
    return await evaluate(`
      (() => {
        const shadow = document.querySelector('#skyline-page-assistant-host').shadowRoot;
        shadow.querySelector('[data-workflow="batch"]').click();
        shadow.getElementById('batch-start-port').value = '1';
        shadow.getElementById('batch-end-port').value = '1';
        shadow.getElementById('batch-slot-count').value = '4';
        shadow.getElementById('batch-prefix').value = '${prefix}';
        shadow.getElementById('batch-scope').value = '${scope}';
        shadow.getElementById('batch-form').requestSubmit();
        const inputs = Array.from(document.querySelectorAll('input[name^="goip_imei("]'));
        return {
          scope: '${scope}',
          values: inputs.slice(0, 4).map((element) => element.value),
          clearCalls: globalThis.batchCalls.length,
          previewVisible: !shadow.getElementById('preview').hidden,
          result: shadow.getElementById('result').textContent,
          count: shadow.getElementById('batch-count').textContent,
          disabledStates: inputs.map((element) => element.disabled),
          outsideValue: inputs[4].value
        };
      })()
    `);
  } finally {
    socket.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
  }
}

try {
  const empty = await runMode('empty');
  const all = await runMode('all');
  const noBlank = await runMode('empty', [original, original, original, original]);
  console.log(JSON.stringify({ original, empty, all, noBlank }, null, 2));
  assert.equal(empty.previewVisible, true, '仅填空白应生成预览');
  assert.equal(all.previewVisible, true, '重建模式应生成预览');
  assert.equal(empty.clearCalls, 0, '仅填空白不得调用真实 Clear');
  assert.equal(all.clearCalls, 1, '重建模式应调用一次真实 Clear');
  assert.equal(empty.values[0], original, '仅填空白不得覆盖原有的非空首格');
  assert.ok(empty.values.slice(1).every((value) => value.startsWith(prefix)), '仅填空白应生成所有空白槽位');
  assert.ok(all.values.every((value) => value.startsWith(prefix)), '重建模式应重建全部所选槽位');
  assert.notDeepEqual(empty.values, all.values, '两种处理方式在已有首格非空时必须产生不同结果');
  assert.match(empty.count, /目标 3 个 · 实际变更 3 个/, '仅填空白应以空白槽位为目标');
  assert.match(all.count, /目标 4 个 · 实际变更 4 个/, '重建模式应以整个范围为目标');
  assert.deepEqual(empty.disabledStates, [false, false, false, false, true], '准备后必须恢复原禁用状态');
  assert.deepEqual(all.disabledStates, [false, false, false, false, true], '重建后必须恢复原禁用状态');
  assert.equal(empty.outsideValue, '867383058253529', '范围外值必须保持不变');
  assert.equal(all.outsideValue, '867383058253529', '重建时范围外值必须保持不变');
  assert.equal(noBlank.previewVisible, false, '没有空白槽位时不得生成预览');
  assert.deepEqual(noBlank.values, [original, original, original, original], '没有空白槽位时不得修改任何值');
  assert.match(noBlank.result, /没有空白槽位/, '没有空白槽位时应显示明确原因');
  console.log('PASS: 仅填空白保留原值，重建模式重建所选范围，无空白时安全停止。');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
