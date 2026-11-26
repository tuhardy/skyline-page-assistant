const test = require('node:test');
const assert = require('node:assert/strict');
const modules = require('../core/modules.js');

test('registers unique bundled modules with only IMEI, ETMS and EIMS allowed to operate', () => {
  const list = modules.listModules();
  assert.equal(new Set(list.map((module) => module.id)).size, list.length);
  assert.equal(new Set(list.flatMap((module) => module.pages)).size, list.length * 2);
  assert.deepEqual(list.filter((module) => module.capability === 'operation').map((module) => module.id), ['imei', 'etms-registration', 'eims-settings']);
  assert.equal(modules.getModule('save-reboot').capability, 'guide');
  assert.equal(modules.getModule('missing'), null);
  assert.equal(modules.getModule('etms-registration').pages[0], 'user_management_en.html');
  assert.notEqual(modules.getModule('etms-registration').id, modules.getModule('eims-settings').id, 'ETMS registration must remain separate from EIMS registration');
});

test('matches only exact real functional-page filenames', () => {
  assert.equal(modules.matchLocation({ pathname: '/goip_imei_cn.html' }).id, 'imei');
  assert.equal(modules.matchLocation({ pathname: '/nested/eims_settings_en.html' }).id, 'eims-settings');
  assert.equal(modules.matchLocation({ pathname: '/goip_sms_ctl_cn.html' }).id, 'sms-control');
  assert.equal(modules.matchLocation({ pathname: '/goip_imei_cn.html?x=1' }), null);
  assert.equal(modules.matchLocation({ pathname: '/fake_goip_imei_cn.html' }), null);
  assert.equal(modules.matchLocation({ pathname: '/initial_config_cn.html' }), null);
});

test('finds real Chinese and English right-frame menu links without translated text', () => {
  const link = (href, text) => ({ href, text, getAttribute: (name) => (name === 'href' ? href : null) });
  const imei = link('goip_imei_cn.html', '任意翻译');
  const eims = link('eims_settings_cn.html', 'EIMS');
  const selectors = new Map([
    ['a[target="right"][href="goip_imei_cn.html"]', [imei]],
    ['a[target="right"][href="eims_settings_cn.html"]', [eims]]
  ]);
  const doc = { querySelectorAll: (selector) => selectors.get(selector) || [] };
  assert.equal(modules.findMenuLink(doc, 'imei'), imei);
  assert.equal(modules.findMenuLink(doc, modules.getModule('eims-settings')), eims);
  assert.equal(modules.findMenuLink(doc, 'sms-control'), null);
  assert.equal(modules.findMenuLink(null, 'imei'), null);
});

test('does not treat temporary or external URLs as ordinary module menu links', () => {
  const doc = { querySelectorAll: () => [] };
  assert.equal(modules.findMenuLink(doc, 'imei'), null);
  assert.equal(modules.matchLocation({ pathname: '/eims_cdr_en.html' }), null);
  assert.equal(modules.matchLocation({ pathname: '/login_cn.html' }), null);
});
