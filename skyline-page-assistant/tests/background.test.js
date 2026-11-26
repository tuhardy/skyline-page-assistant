const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createBackground() {
  const data = Object.create(null);
  let messageListener;
  const chrome = {
    action: { onClicked: { addListener() {} } },
    tabs: { sendMessage() {} },
    runtime: {
      onMessage: { addListener(listener) { messageListener = listener; } }
    },
    storage: {
      local: {
        async get(key) { return { [key]: data[key] }; },
        async set(items) { Object.assign(data, items); },
        async remove(key) { delete data[key]; }
      },
      session: {
        async get(key) { return { [key]: data[key] }; },
        async set(items) { Object.assign(data, items); },
        async remove(key) { delete data[key]; }
      }
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  vm.runInNewContext(source, { chrome, URL });
  return {
    data,
    async dispatch(message, sender = { url: 'http://192.0.2.1/main_en.html' }) {
      let response;
      const asynchronous = messageListener(message, sender, (value) => { response = value; });
      assert.equal(asynchronous, true);
      await new Promise((resolve) => setImmediate(resolve));
      return response;
    },
    dispatchIgnored(message) {
      return messageListener(message, {}, () => {});
    }
  };
}

test('background broker stores and returns only the pending operation record', async () => {
  const background = createBackground();
  const pending = { version: 2, kind: 'batch', changes: [{ inputName: 'goip_imei(1.01)' }] };
  const key = 'skyline.imei.pending';
  const stored = await background.dispatch({ type: 'skyline.pending.set', key, value: pending });
  assert.equal(stored.ok, true);
  const response = await background.dispatch({ type: 'skyline.pending.get', key });
  assert.equal(response.ok, true);
  assert.deepEqual(response.value, pending);
  const removed = await background.dispatch({ type: 'skyline.pending.remove', key });
  assert.equal(removed.ok, true);
  assert.equal(background.data[key], undefined);
});

test('background broker stores ETMS readback facts under their own session key', async () => {
  const background = createBackground();
  const key = 'skyline.etms.pending';
  const pending = {
    version: 1,
    kind: 'etms',
    origin: 'http://192.0.2.1',
    path: '/user_management_cn.html',
    expected: { type: 2, server: 'remote.tyhtsf.com', port: '50000', account: 'testeSIM' },
    attempts: 0,
    createdAt: Date.now()
  };
  const stored = await background.dispatch({ type: 'skyline.pending.set', key, value: pending });
  assert.equal(stored.ok, true);
  const response = await background.dispatch({ type: 'skyline.pending.get', key });
  assert.equal(response.ok, true);
  assert.deepEqual(response.value, pending);
  assert.equal(Object.hasOwn(response.value.expected, 'password'), false);
  await background.dispatch({ type: 'skyline.pending.remove', key });
  assert.equal(background.data[key], undefined);
});

test('background broker rejects other storage keys and unrelated messages', async () => {
  const background = createBackground();
  assert.equal(background.dispatchIgnored({ type: 'skyline.pending.get', key: 'other.key' }), undefined);
  assert.equal(background.dispatchIgnored({ type: 'other.message', key: 'skyline.imei.pending' }), undefined);
  assert.equal(background.dispatchIgnored(null), undefined);
});

test('background broker preserves a complete batch pending record', async () => {
  const background = createBackground();
  const pending = {
    version: 2,
    kind: 'batch',
    origin: 'http://192.0.2.1',
    path: '/goip_imei_en.html',
    verificationAttempts: 1,
    changes: [
      { inputName: 'goip_imei(1.01)', finalValue: '867383051234567' },
      { inputName: 'goip_imei(1.02)', finalValue: '867383058252281' }
    ]
  };
  await background.dispatch({ type: 'skyline.pending.set', key: 'skyline.imei.pending', value: pending });
  const response = await background.dispatch({ type: 'skyline.pending.get', key: 'skyline.imei.pending' });
  assert.equal(response.value.changes.length, 2);
  assert.equal(response.value.verificationAttempts, 1);
  assert.equal(response.value.kind, 'batch');
});

test('device profile preference is isolated by real sender origin and limited to three values', async () => {
  const background = createBackground();
  const key = 'skyline.device-profile.preferences';
  const firstOrigin = { url: 'http://192.0.2.1/main_en.html' };
  const secondOrigin = { url: 'http://192.0.2.2:8080/main_en.html' };
  const saved = await background.dispatch({ type: 'skyline.profile.set', key, value: 'sms', ignored: 'not stored' }, firstOrigin);
  assert.equal(saved.ok, true);
  assert.equal(saved.value, 'sms');
  const first = await background.dispatch({ type: 'skyline.profile.get', key }, firstOrigin);
  const second = await background.dispatch({ type: 'skyline.profile.get', key }, secondOrigin);
  assert.equal(first.value, 'sms');
  assert.equal(second.value, 'auto');
  const invalid = await background.dispatch({ type: 'skyline.profile.set', key, value: 'other' }, firstOrigin);
  assert.equal(invalid.ok, false);
  assert.deepEqual(JSON.parse(JSON.stringify(background.data[key])), { 'http://192.0.2.1': 'sms' });
});
