const test = require('node:test');
const assert = require('node:assert/strict');
const imei = require('../core/imei.js');

test('parses numeric and alphabetic real-device input names', () => {
  assert.deepEqual(imei.parseImeiInputName('goip_imei(1.01)'), {
    port: 1, slot: 1, slotLabel: '01'
  });
  assert.deepEqual(imei.parseImeiInputName('goip_imei(16.32)'), {
    port: 16, slot: 32, slotLabel: '32'
  });
  assert.deepEqual(imei.parseImeiInputName('goip_imei(2A)'), {
    port: 2, slot: 1, slotLabel: 'A'
  });
  assert.equal(imei.parseImeiInputName('goip_imei(0.01)'), null);
  assert.equal(imei.parseImeiInputName('goip_imei_start'), null);
});

test('computes the same check digit as the real page examples', () => {
  assert.equal(imei.imeiCheckDigit('86738305825352'), '9');
  assert.equal(imei.imeiCheckDigit('86738305825228'), '1');
  assert.equal(imei.imeiCheckDigit('86738305825347'), '9');
});

test('normalizes 14-digit input and validates a complete 15-digit IMEI', () => {
  assert.deepEqual(imei.normalizeImei('86738305825352'), {
    enteredValue: '86738305825352',
    finalValue: '867383058253529',
    autoCompleted: true
  });
  assert.equal(imei.normalizeImei('867383058253529').finalValue, '867383058253529');
  assert.throws(() => imei.normalizeImei('867383058253520'), /校验位不正确/);
  assert.throws(() => imei.normalizeImei('867383'), /14 位或 15 位/);
  assert.throws(() => imei.normalizeImei('8673830582535A'), /只能包含数字/);
});

test('collects and sorts only real IMEI controls', () => {
  const elements = [
    { name: 'goip_imei(2.01)', value: ' 123 ', disabled: false },
    { name: 'goip_imei(1.02)', value: '', disabled: true },
    { name: 'goip_imei(1.01)', value: '867383058253529', disabled: false },
    { name: 'goip_imei_start', value: 'ignored', disabled: false }
  ];
  const controls = imei.collectImeiControls({ querySelectorAll: () => elements });
  assert.deepEqual(controls.map((item) => item.name), [
    'goip_imei(1.01)', 'goip_imei(1.02)', 'goip_imei(2.01)'
  ]);
  assert.equal(controls[0].value, '867383058253529');
  assert.equal(controls[1].disabled, true);
  assert.equal(imei.findControl(controls, 1, 2).name, 'goip_imei(1.02)');
});

test('finds batch buttons by real handlers instead of translated labels', () => {
  const copy = { value: '复制', onclick: "return copyImei('ID_TabImeiList');" };
  const clear = { value: '清空', onclick: "return clearImei('ID_TabImeiList');" };
  const autoComplete = { value: '自动补全', onclick: "return completeImeis('ID_TabImeiList');" };
  const selectors = new Map([
    ['#ID_SpanCopyImei input[type="button"][onclick*="copyImei("]', copy],
    ['#ID_SpanCopyImei input[type="button"][onclick*="clearImei("]', clear],
    ['#ID_SpanCopyImei input[type="button"][onclick*="completeImeis("]', autoComplete]
  ]);
  const doc = { querySelector: (selector) => selectors.get(selector) || null };
  assert.equal(imei.findBatchButton(doc, 'Copy'), copy);
  assert.equal(imei.findBatchButton(doc, 'Clear'), clear);
  assert.equal(imei.findBatchButton(doc, 'AutoComplete'), autoComplete);
  assert.equal(imei.findBatchButton(doc, 'Submit'), null);
});

test('selects an exact batch port range and per-port slot count', () => {
  const controls = [];
  for (let port = 1; port <= 3; port += 1) {
    for (let slot = 1; slot <= 4; slot += 1) {
      controls.push({
        port, slot, slotLabel: String(slot).padStart(2, '0'),
        name: `goip_imei(${port}.${String(slot).padStart(2, '0')})`,
        value: '', disabled: false
      });
    }
  }
  const selected = imei.selectBatchControls(controls, 2, 3, 2);
  assert.deepEqual(selected.map((control) => control.name), [
    'goip_imei(2.01)', 'goip_imei(2.02)',
    'goip_imei(3.01)', 'goip_imei(3.02)'
  ]);
});

test('rejects unavailable, reversed, or disabled batch targets', () => {
  const controls = [
    { port: 1, slot: 1, slotLabel: '01', name: 'goip_imei(1.01)', disabled: false },
    { port: 1, slot: 2, slotLabel: '02', name: 'goip_imei(1.02)', disabled: true },
    { port: 2, slot: 1, slotLabel: '01', name: 'goip_imei(2.01)', disabled: false }
  ];
  assert.throws(() => imei.selectBatchControls(controls, 2, 1, 1), /起止端口/);
  assert.throws(() => imei.selectBatchControls(controls, 1, 1, 0), /大于 0/);
  assert.throws(() => imei.selectBatchControls(controls, 2, 2, 2), /不存在/);
  assert.throws(() => imei.selectBatchControls(controls, 1, 1, 2), /不可编辑/);
});

test('creates a deliberate single-control change plan', () => {
  const control = {
    port: 1,
    slot: 2,
    slotLabel: '02',
    name: 'goip_imei(1.02)',
    value: '867383058252281',
    disabled: false
  };
  const plan = imei.createChangePlan(0, control, '86738305825352');
  assert.equal(plan.previousValue, '867383058252281');
  assert.equal(plan.finalValue, '867383058253529');
  assert.equal(plan.changed, true);
  assert.throws(() => imei.createChangePlan(4, control, '86738305825352'), /当前不是/);
  assert.throws(() => imei.createChangePlan(0, { ...control, disabled: true }, '86738305825352'), /禁用/);
});

test('reports readback success, mismatch, and unconfirmed states accurately', () => {
  const pending = {
    port: 1,
    slotLabel: '02',
    previousValue: '867383058252281',
    finalValue: '867383058253529'
  };
  assert.equal(imei.evaluateReadback(pending, { value: '867383058253529' }).status, 'success');
  assert.equal(imei.evaluateReadback(pending, { value: '867383058252281' }).status, 'failure');
  assert.equal(imei.evaluateReadback(pending, null).status, 'unconfirmed');
});

test('requires both the real URL and DOM fingerprints', () => {
  const doc = {
    querySelector(selector) {
      return ['#imeiTypeFormID', '#ID_TabImeiList'].includes(selector) ? {} : null;
    }
  };
  assert.equal(imei.isSupportedPage({ pathname: '/goip_imei_en.html' }, doc), true);
  assert.equal(imei.isSupportedPage({ pathname: '/goip_sms_ctl_en.html' }, doc), false);
  assert.equal(imei.isSupportedPage({ pathname: '/goip_imei_en.html' }, { querySelector: () => null }), false);
});

test('accepts only an eight-digit numeric batch prefix', () => {
  assert.equal(imei.normalizeBatchPrefix(' 86738305 '), '86738305');
  assert.throws(() => imei.normalizeBatchPrefix('867383'), /8 位数字/);
  assert.throws(() => imei.normalizeBatchPrefix('867383058'), /8 位数字/);
  assert.throws(() => imei.normalizeBatchPrefix('8673830A'), /8 位数字/);
  assert.throws(() => imei.normalizeBatchPrefix(''), /8 位数字/);
});

test('builds a batch diff by real input name without losing original values', () => {
  const before = [
    { name: 'goip_imei(1.01)', port: 1, slot: 1, slotLabel: '01', value: '' },
    { name: 'goip_imei(1.02)', port: 1, slot: 2, slotLabel: '02', value: '867383058252281' },
    { name: 'goip_imei(2.01)', port: 2, slot: 1, slotLabel: '01', value: '867383058253529' }
  ];
  const after = [
    { ...before[0], value: '867383051234567' },
    { ...before[1] },
    { ...before[2], value: '867383059999999' }
  ];
  const changes = imei.buildBatchChanges(before, after);
  assert.deepEqual(changes, [
    {
      inputName: 'goip_imei(1.01)', port: 1, slot: 1, slotLabel: '01',
      previousValue: '', finalValue: '867383051234567'
    },
    {
      inputName: 'goip_imei(2.01)', port: 2, slot: 1, slotLabel: '01',
      previousValue: '867383058253529', finalValue: '867383059999999'
    }
  ]);
  assert.equal(before[0].value, '', 'building a diff must not mutate the original snapshot');
});

test('reports complete batch readback success only when every target matches', () => {
  const pending = {
    changes: [
      { inputName: 'goip_imei(1.01)', finalValue: '867383051234567' },
      { inputName: 'goip_imei(1.02)', finalValue: '867383058252281' }
    ]
  };
  const result = imei.evaluateBatchReadback(pending, [
    { name: 'goip_imei(1.01)', value: '867383051234567' },
    { name: 'goip_imei(1.02)', value: '867383058252281' }
  ]);
  assert.equal(result.status, 'success');
  assert.equal(result.matched, 2);
  assert.equal(result.mismatched.length, 0);
});

test('distinguishes delayed batch mismatches from missing readback controls', () => {
  const pending = {
    changes: [
      { inputName: 'goip_imei(1.01)', finalValue: '867383051234567' },
      { inputName: 'goip_imei(1.02)', finalValue: '867383058252281' }
    ]
  };
  const delayed = imei.evaluateBatchReadback(pending, [
    { name: 'goip_imei(1.01)', value: '867383051234567' },
    { name: 'goip_imei(1.02)', value: '' }
  ]);
  assert.equal(delayed.status, 'failure');
  assert.equal(delayed.matched, 1);
  assert.equal(delayed.mismatched[0].actualValue, '');
  assert.match(delayed.message, /延迟/);

  const missing = imei.evaluateBatchReadback(pending, [
    { name: 'goip_imei(1.01)', value: '867383051234567' }
  ]);
  assert.equal(missing.status, 'unconfirmed');
  assert.equal(missing.missing.length, 1);
  assert.equal(missing.missing[0].inputName, 'goip_imei(1.02)');
});
