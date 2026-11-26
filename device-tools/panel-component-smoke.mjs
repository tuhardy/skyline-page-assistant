import { readFile, writeFile } from 'node:fs/promises';

const port = process.argv[2] || '9334';
const project = 'C:\\Users\\EDY\\Desktop\\sk基本操作\\skyline-page-assistant';
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

try {
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate(await readFile(`${project}\\content\\panel.js`, 'utf8'));
  await evaluate(await readFile(`${project}\\core\\imei.js`, 'utf8'));
  const languageIndependentButtons = await evaluate(`
    (() => {
      const fixture = document.createElement('div');
      fixture.innerHTML = '<span id="ID_SpanCopyImei">' +
        '<input type="button" value="复制" onclick="return copyImei()">' +
        '<input type="button" value="清空" onclick="return clearImei()">' +
        '<input type="button" value="自动补全" onclick="return completeImeis()">' +
        '</span>';
      return {
        copy: SkylineImei.findBatchButton(fixture, 'Copy')?.value,
        clear: SkylineImei.findBatchButton(fixture, 'Clear')?.value,
        autoComplete: SkylineImei.findBatchButton(fixture, 'AutoComplete')?.value
      };
    })()
  `);
  const controls = [
    { port: 1, slot: 1, slotLabel: '01', name: 'goip_imei(1.01)', value: '', disabled: false },
    { port: 1, slot: 2, slotLabel: '02', name: 'goip_imei(1.02)', value: '867383058252281', disabled: false }
  ];
  await evaluate(`
    globalThis.smokeEvents = [];
    globalThis.smokePanel = new globalThis.SkylinePanel({
      onBatchCancel(plan) { globalThis.smokeEvents.push({ type: 'cancel', kind: plan.kind }); }
    });
    smokePanel.setPage(0, ${JSON.stringify(controls)});
    smokePanel.setWorkflow('batch');
    smokePanel.batchSlotCount.value = '1';
    smokePanel.updateBatchTargetSummary();
    smokePanel.setBatchPreview({
      prefix: '86738305',
      scope: 'empty',
      startPort: 1,
      endPort: 1,
      slotCount: 1,
      targetCount: 1,
      beforeSnapshot: [{ name: 'goip_imei(1.01)', value: '' }],
      afterSnapshot: [{ name: 'goip_imei(1.01)', value: '867383051234567' }],
      changes: [{ inputName: 'goip_imei(1.01)', port: 1, slot: 1, slotLabel: '01', previousValue: '', finalValue: '867383051234567' }]
    });
    smokePanel.setStep(5);
    smokePanel.toggle(true);
  `);
  const initial = await evaluate(`
    (() => {
      const shadow = smokePanel.shadow;
      const rect = smokePanel.host.getBoundingClientRect();
      return {
        hosts: document.querySelectorAll('#skyline-page-assistant-host').length,
        previewVisible: !shadow.getElementById('preview').hidden,
        batchVisible: !shadow.getElementById('batch-preview').hidden,
        executeEnabled: !shadow.getElementById('execute-button').disabled,
        prefixLocked: shadow.getElementById('batch-prefix').disabled,
        scopeLocked: shadow.getElementById('batch-scope').disabled,
        rangeLocked: shadow.getElementById('batch-start-port').disabled && shadow.getElementById('batch-end-port').disabled && shadow.getElementById('batch-slot-count').disabled,
        rangeSummary: shadow.getElementById('batch-target').textContent,
        step: shadow.getElementById('step-count').textContent,
        count: shadow.getElementById('batch-count').textContent,
        rows: shadow.querySelectorAll('.batch-row').length,
        panelRight: Math.round(rect.right),
        viewportWidth: innerWidth
      };
    })()
  `);
  const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const screenshotPath = 'C:\\Users\\EDY\\Desktop\\sk基本操作\\device-tools\\panel-batch-smoke.png';
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  const cancellation = await evaluate(`
    (() => {
      const cancel = smokePanel.shadow.getElementById('cancel-preview');
      cancel.click();
      const normalCallbacks = smokeEvents.length;
      smokePanel.markAttempted();
      cancel.click();
      return {
        normalCallbacks,
        callbacksAfterAttemptedCancel: smokeEvents.length,
        attemptedWarning: smokePanel.shadow.getElementById('result').textContent,
        attempted: smokePanel.plan.attempted
      };
    })()
  `);
  console.log(JSON.stringify({ languageIndependentButtons, initial, cancellation, screenshot: screenshotPath }, null, 2));
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
}
