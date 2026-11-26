const test = require('node:test');
const assert = require('node:assert/strict');
const etms = require('../core/etms.js');

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

function etmsDocument(options = {}) {
  const radios = [0, 1, 2].map((value) => element({
    value: String(value),
    checked: value === (options.type ?? 2),
    disabled: Boolean(options.disabled)
  }));
  const server = element({ value: options.server ?? 'remote.tyhtsf.com', disabled: Boolean(options.disabled) });
  const port = element({ value: options.port ?? '50000', disabled: Boolean(options.disabled) });
  const account = element({ value: options.account ?? 'testeSIM', disabled: Boolean(options.disabled) });
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
    querySelector(selector) {
      if (selector === 'form') return form;
      if (options.nameOnly) {
        // Voice firmware variant: server/account/password carry only a name, port has both.
        if (selector === '#ID_erms_ip' || selector === '#ID_ermc_username' || selector === '#ID_ermc_password') return null;
        if (selector === 'input[name="erms_ip"]') return server;
        if (selector === 'input[name="ermc_username"]') return account;
        if (selector === 'input[name="ermc_password"]') return password;
      }
      if (selector === '#ID_erms_ip') return server;
      if (selector === '#ID_erms_port') return port;
      if (selector === '#ID_ermc_username') return account;
      if (selector === '#ID_ermc_password') return password;
      if (selector === '#ID_TdErmStatus') return status;
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'input[name="ermc_enable"]' ? radios : [];
    }
  };
  const doc = {
    querySelector(selector) {
      return selector === '#EjoinRemMgmtBox' ? box : null;
    },
    querySelectorAll() { return []; }
  };
  return { doc, elements: { radios, server, port, account, password, status, submit, form, box } };
}

test('recognizes only real user_management pages with the ETMS form', () => {
  const { doc } = etmsDocument();
  assert.equal(etms.isSupportedPage({ pathname: '/user_management_cn.html' }, doc), true);
  assert.equal(etms.isSupportedPage({ pathname: '/user_management_en.html' }, doc), true);
  assert.equal(etms.isSupportedPage({ pathname: '/user_management_cn.html?x=1' }, doc), false);
  assert.equal(etms.isSupportedPage({ pathname: '/eims_settings_cn.html' }, doc), false);
  assert.equal(etms.isSupportedPage({ pathname: '/user_management_cn.html' }, etmsDocument({ missingSubmit: true }).doc), false);
});

test('reads current ETMS facts and reduces the password to a non-empty boolean', () => {
  const { doc } = etmsDocument({ type: 0, status: 'Connecting' });
  const current = etms.readCurrent(doc);
  assert.equal(current.type, 0);
  assert.equal(current.server, 'remote.tyhtsf.com');
  assert.equal(current.port, '50000');
  assert.equal(current.account, 'testeSIM');
  assert.equal(current.status, 'Connecting');
  assert.equal(current.passwordFilled, true);
  assert.equal(current.disabled, false);
  const snap = etms.snapshot(current);
  assert.equal(Object.hasOwn(snap, 'password'), false);
  assert.equal(snap.passwordFilled, true);
  assert.doesNotMatch(JSON.stringify(snap), /device-rendered-pw-must-not-leak/);

  const empty = etms.readCurrent(etmsDocument({ passwordEmpty: true }).doc);
  assert.equal(empty.passwordFilled, false);
  assert.equal(etms.snapshot(empty).passwordFilled, false);
});

test('recognizes firmware whose ETMS fields carry only names, not ids', () => {
  const { doc } = etmsDocument({ nameOnly: true, status: 'OK' });
  assert.equal(etms.isSupportedPage({ pathname: '/user_management_en.html' }, doc), true);
  const current = etms.readCurrent(doc);
  assert.equal(current.type, etms.ETMS_TYPE);
  assert.equal(current.server, 'remote.tyhtsf.com');
  assert.equal(current.port, '50000');
  assert.equal(current.account, 'testeSIM');
  assert.equal(current.status, 'OK');
  assert.equal(current.passwordFilled, true);
  assert.equal(Object.hasOwn(etms.snapshot(current), 'password'), false);
});

test('creates a plan from the real form without the password ever entering it', () => {
  const current = etms.readCurrent(etmsDocument().doc);
  const plan = etms.createChangePlan(current);
  assert.equal(plan.kind, 'etms');
  assert.equal(plan.type, etms.ETMS_TYPE);
  assert.equal(plan.server, 'remote.tyhtsf.com');
  assert.equal(plan.port, 50000);
  assert.equal(plan.account, 'testeSIM');
  assert.equal(Object.hasOwn(plan, 'password'), false);
  assert.equal(Object.hasOwn(plan, 'changed'), false);
  assert.equal(Object.hasOwn(plan, 'previous'), false);
  assert.equal(Object.hasOwn(plan.snapshot, 'password'), false);
  assert.equal(plan.snapshot.passwordFilled, true);
  assert.doesNotMatch(JSON.stringify(plan), /device-rendered-pw-must-not-leak/);

  const padded = etms.createChangePlan({ ...current, server: ' remote.tyhtsf.com ', account: ' testeSIM ' });
  assert.equal(padded.server, 'remote.tyhtsf.com');
  assert.equal(padded.account, 'testeSIM');
});

test('rejects plans until the real form is ready, without touching the password', () => {
  const current = etms.readCurrent(etmsDocument().doc);
  assert.throws(() => etms.createChangePlan(null), /不是可识别/);
  assert.throws(() => etms.createChangePlan(etms.readCurrent(etmsDocument({ type: 0 }).doc)), /选择 ETMS/);
  assert.throws(() => etms.createChangePlan(etms.readCurrent(etmsDocument({ type: 1 }).doc)), /选择 ETMS/);
  assert.throws(() => etms.createChangePlan(etms.readCurrent(etmsDocument({ passwordEmpty: true }).doc)), /密码/);
  assert.throws(() => etms.createChangePlan(etms.readCurrent(etmsDocument({ disabled: true }).doc)), /禁用/);
  assert.throws(() => etms.createChangePlan({ ...current, server: '' }), /服务器/);
  assert.throws(() => etms.createChangePlan({ ...current, server: 'a b' }), /空白/);
  assert.throws(() => etms.createChangePlan({ ...current, port: '0' }), /端口/);
  assert.throws(() => etms.createChangePlan({ ...current, port: 'x' }), /数字/);
  assert.throws(() => etms.createChangePlan({ ...current, account: '' }), /账号/);
});

test('compares snapshots including passwordFilled and evaluates readback without password', () => {
  const before = etms.snapshot(etms.readCurrent(etmsDocument({ status: 'Connecting' }).doc));
  const afterStatus = etms.snapshot(etms.readCurrent(etmsDocument({ status: 'OK' }).doc));
  assert.equal(etms.snapshotsEqual(before, afterStatus), true);
  assert.equal(etms.snapshotsEqual(before, etms.snapshot(etms.readCurrent(etmsDocument({ server: 'other.example.com' }).doc))), false);
  const emptied = etms.snapshot(etms.readCurrent(etmsDocument({ passwordEmpty: true }).doc));
  assert.equal(etms.snapshotsEqual(before, emptied), false);

  const pending = {
    kind: 'etms',
    expected: { type: etms.ETMS_TYPE, server: 'remote.tyhtsf.com', port: '50000', account: 'testeSIM' }
  };
  const ok = etms.evaluateRegistrationReadback(pending, etms.readCurrent(etmsDocument({ status: 'OK' }).doc));
  assert.equal(ok.status, 'success');
  assert.match(ok.message, /OK/);
  assert.doesNotMatch(ok.message, /device-rendered-pw-must-not-leak|secret/);
  const waiting = etms.evaluateRegistrationReadback(pending, etms.readCurrent(etmsDocument({ status: 'Connecting' }).doc));
  assert.equal(waiting.status, 'unconfirmed');
  const mismatch = etms.evaluateRegistrationReadback(pending, etms.readCurrent(etmsDocument({ server: 'other.example.com', status: 'OK' }).doc));
  assert.equal(mismatch.status, 'failure');
  assert.match(mismatch.message, /不一致/);
  assert.equal(etms.evaluateRegistrationReadback(pending, null).status, 'unconfirmed');
});
