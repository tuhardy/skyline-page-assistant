const test = require('node:test');
const assert = require('node:assert/strict');
const eims = require('../core/eims.js');

function element(props = {}) {
  return {
    value: '',
    checked: false,
    disabled: false,
    textContent: '',
    ...props,
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

// Faithful to the real page: the form wraps #ESN_Box, the selects carry ids,
// and the server/username/password inputs carry only a name (no id).
function eimsDocument(options = {}) {
  const typeSelect = element({ value: String(options.type ?? 1), disabled: Boolean(options.disabled) });
  const server = element({ value: options.server ?? 'eims.example.com', disabled: Boolean(options.disabled) });
  const protocol = options.noProtocolRow
    ? null
    : element({ value: options.protocol ?? '1', disabled: Boolean(options.disabled) });
  const username = element({ value: options.username ?? 'eimsUser', disabled: Boolean(options.disabled) });
  const password = element({
    value: options.passwordEmpty ? '' : (options.pagePassword ?? 'device-rendered-pw-must-not-leak'),
    disabled: Boolean(options.disabled)
  });
  const status = element({ textContent: options.status ?? '' });
  const submit = options.missingSubmit ? null : element({});
  const form = {
    querySelector(selector) {
      return selector === '.infoBoxBodyBtns input[type="submit"]' ? submit : null;
    }
  };
  const box = {
    closest(selector) { return selector === 'form' ? form : null; },
    querySelector(selector) {
      if (selector === 'form') return form;
      if (selector === '#ID_esn_server_type' || selector === '[name="esn_server_type"]') return typeSelect;
      if (selector === '#ID_esn_server') return null;
      if (selector === '[name="esn_server"]') return server;
      if (selector === '#ID_esn_ucp_tcp' || selector === '[name="esn_ucp_tcp"]') return protocol;
      if (selector === '#ID_esn_username') return null;
      if (selector === '[name="esn_username"]') return username;
      if (selector === '#ID_esn_password') return null;
      if (selector === '[name="esn_password"]') return password;
      if (selector === '#ID_TdEsnStatus') return status;
      return null;
    },
    querySelectorAll() { return []; }
  };
  const doc = {
    querySelector(selector) {
      return selector === '#ESN_Box' ? box : null;
    },
    querySelectorAll() { return []; }
  };
  return { doc, elements: { typeSelect, server, protocol, username, password, status, submit, form, box } };
}

test('recognizes only real EIMS pages with the registration form', () => {
  const { doc } = eimsDocument();
  assert.equal(eims.isSupportedPage({ pathname: '/eims_settings_en.html' }, doc), true);
  assert.equal(eims.isSupportedPage({ pathname: '/eims_settings_cn.html' }, doc), true);
  assert.equal(eims.isSupportedPage({ pathname: '/app_esn_en.html' }, doc), true);
  assert.equal(eims.isSupportedPage({ pathname: '/user_management_en.html' }, doc), false);
  assert.equal(eims.isSupportedPage({ pathname: '/eims_settings_en.html?x=1' }, doc), false);
  assert.equal(eims.isSupportedPage({ pathname: '/eims_settings_en.html' }, eimsDocument({ missingSubmit: true }).doc), false);
});

test('reads current EIMS facts and reduces the password to a non-empty boolean', () => {
  const { doc } = eimsDocument({ type: 0, status: 'Connecting' });
  const current = eims.readCurrent(doc);
  assert.equal(current.type, 0);
  assert.equal(current.server, 'eims.example.com');
  assert.equal(current.protocol, '1');
  assert.equal(current.username, 'eimsUser');
  assert.equal(current.status, 'Connecting');
  assert.equal(current.passwordFilled, true);
  assert.equal(current.disabled, false);
  const snap = eims.snapshot(current);
  assert.equal(Object.hasOwn(snap, 'password'), false);
  assert.equal(snap.passwordFilled, true);
  assert.doesNotMatch(JSON.stringify(snap), /device-rendered-pw-must-not-leak/);

  const empty = eims.readCurrent(eimsDocument({ passwordEmpty: true }).doc);
  assert.equal(empty.passwordFilled, false);

  const noRow = eims.readCurrent(eimsDocument({ noProtocolRow: true }).doc);
  assert.equal(noRow.protocol, null);
  assert.equal(eims.snapshot(noRow).protocol, null);
});

test('creates a plan from the real form without the password ever entering it', () => {
  const current = eims.readCurrent(eimsDocument().doc);
  const plan = eims.createChangePlan(current);
  assert.equal(plan.kind, 'eims');
  assert.equal(plan.type, eims.EIMS_TYPE);
  assert.equal(plan.server, 'eims.example.com');
  assert.equal(plan.protocol, '1');
  assert.equal(plan.username, 'eimsUser');
  assert.equal(Object.hasOwn(plan, 'password'), false);
  assert.equal(Object.hasOwn(plan, 'changed'), false);
  assert.equal(Object.hasOwn(plan, 'previous'), false);
  assert.equal(Object.hasOwn(plan.snapshot, 'password'), false);
  assert.equal(plan.snapshot.passwordFilled, true);
  assert.doesNotMatch(JSON.stringify(plan), /device-rendered-pw-must-not-leak/);

  const withPort = eims.createChangePlan({ ...current, server: ' eims.example.com:8080 ' });
  assert.equal(withPort.server, 'eims.example.com:8080');

  const noRow = eims.createChangePlan(eims.readCurrent(eimsDocument({ noProtocolRow: true }).doc));
  assert.equal(noRow.protocol, null);
});

test('rejects plans until the real form is ready, without touching the password', () => {
  const current = eims.readCurrent(eimsDocument().doc);
  assert.throws(() => eims.createChangePlan(null), /不是可识别/);
  assert.throws(() => eims.createChangePlan(eims.readCurrent(eimsDocument({ type: 0 }).doc)), /EIMS/);
  assert.throws(() => eims.createChangePlan(eims.readCurrent(eimsDocument({ type: 2 }).doc)), /EIMS/);
  assert.throws(() => eims.createChangePlan(eims.readCurrent(eimsDocument({ passwordEmpty: true }).doc)), /密码/);
  assert.throws(() => eims.createChangePlan(eims.readCurrent(eimsDocument({ disabled: true }).doc)), /禁用/);
  assert.throws(() => eims.createChangePlan({ ...current, server: '' }), /服务器地址/);
  assert.throws(() => eims.createChangePlan({ ...current, server: 'a b' }), /空白/);
  assert.throws(() => eims.createChangePlan({ ...current, server: 'host:abc' }), /端口必须是数字/);
  assert.throws(() => eims.createChangePlan({ ...current, server: 'host:0' }), /1 到 65535/);
  assert.throws(() => eims.createChangePlan({ ...current, server: 'a:b:c' }), /格式/);
  assert.throws(() => eims.createChangePlan({ ...current, username: '' }), /用户名/);
  assert.throws(() => eims.createChangePlan({ ...current, protocol: '5' }), /UDP\/TCP/);
});

test('compares snapshots including protocol and passwordFilled', () => {
  const before = eims.snapshot(eims.readCurrent(eimsDocument({ status: 'Connecting' }).doc));
  const afterStatus = eims.snapshot(eims.readCurrent(eimsDocument({ status: 'OK' }).doc));
  assert.equal(eims.snapshotsEqual(before, afterStatus), true);
  assert.equal(eims.snapshotsEqual(before, eims.snapshot(eims.readCurrent(eimsDocument({ server: 'other.example.com' }).doc))), false);
  assert.equal(eims.snapshotsEqual(before, eims.snapshot(eims.readCurrent(eimsDocument({ protocol: '0' }).doc))), false);
  assert.equal(eims.snapshotsEqual(before, eims.snapshot(eims.readCurrent(eimsDocument({ passwordEmpty: true }).doc))), false);
  assert.equal(eims.snapshotsEqual(before, eims.snapshot(eims.readCurrent(eimsDocument({ noProtocolRow: true }).doc))), false);
});

test('evaluates readback: awaiting reboot, OK, mismatch, and unknown statuses', () => {
  const pending = {
    kind: 'eims',
    expected: { type: eims.EIMS_TYPE, server: 'eims.example.com', protocol: '1', username: 'eimsUser' }
  };
  const awaiting = eims.evaluateRegistrationReadback(pending, eims.readCurrent(eimsDocument({ status: '' }).doc));
  assert.equal(awaiting.status, 'awaiting-reboot');
  assert.match(awaiting.message, /保存并重启/);

  const ok = eims.evaluateRegistrationReadback(pending, eims.readCurrent(eimsDocument({ status: 'OK' }).doc));
  assert.equal(ok.status, 'success');
  assert.match(ok.message, /OK/);
  assert.doesNotMatch(ok.message, /device-rendered-pw-must-not-leak|secret/);

  const okWithCode = eims.evaluateRegistrationReadback(pending, eims.readCurrent(eimsDocument({ status: '200 OK' }).doc));
  assert.equal(okWithCode.status, 'success');

  const waiting = eims.evaluateRegistrationReadback(pending, eims.readCurrent(eimsDocument({ status: 'Connecting' }).doc));
  assert.equal(waiting.status, 'unconfirmed');
  assert.match(waiting.message, /Connecting/);

  const mismatch = eims.evaluateRegistrationReadback(pending, eims.readCurrent(eimsDocument({ server: 'other.example.com', status: 'OK' }).doc));
  assert.equal(mismatch.status, 'failure');
  assert.match(mismatch.message, /不一致/);

  const protocolMismatch = eims.evaluateRegistrationReadback(pending, eims.readCurrent(eimsDocument({ protocol: '0', status: 'OK' }).doc));
  assert.equal(protocolMismatch.status, 'failure');

  assert.equal(eims.evaluateRegistrationReadback(pending, null).status, 'unconfirmed');
  assert.equal(eims.evaluateRegistrationReadback(null, eims.readCurrent(eimsDocument().doc)).status, 'unconfirmed');
});
