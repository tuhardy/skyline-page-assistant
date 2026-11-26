const test = require('node:test');
const assert = require('node:assert/strict');
const modules = require('../core/modules.js');
const profiles = require('../core/device-profile.js');

function menuFixture(availablePages, options = {}) {
  const links = new Map();
  const doc = {
    querySelectorAll(selector) {
      const match = /href="([^"]+)"/.exec(selector);
      if (!match) return [];
      const href = match[1];
      if (!links.has(href)) {
        const available = availablePages.some((base) => href === `${base}_en.html` || href === `${base}_cn.html`);
        const item = options.withoutListItems ? null : {
          hidden: false,
          classList: { contains: (name) => name === 'MenuOff' && !available }
        };
        links.set(href, {
          getAttribute: (name) => (name === 'href' ? href : null),
          closest: (selectorName) => (selectorName === 'li' ? item : null)
        });
      }
      return [links.get(href)];
    }
  };
  return doc;
}

test('detects an SMS device even when voice menus are also available', () => {
  const doc = menuFixture(['goip_sms_ctl', 'eims_settings', 'goip_calls_ctl', 'call_dur_ctl']);
  const result = profiles.detect(doc, modules);
  assert.equal(result.profile, 'sms');
  assert.deepEqual(result.smsEvidence, ['goip_sms_ctl', 'eims_settings']);
  assert.deepEqual(result.voiceEvidence, ['call-duration', 'call-count']);
});

test('detects a voice device only when SMS evidence is unavailable', () => {
  const doc = menuFixture(['goip_calls_ctl', 'goip_talks_ctl', 'call_ctrl_setting']);
  const result = profiles.detect(doc, modules);
  assert.equal(result.profile, 'voice');
  assert.equal(result.smsEvidence.length, 0);
  assert.equal(result.voiceEvidence.length, 3);
});

test('collapsed menu sections do not hide supported capabilities', () => {
  const doc = menuFixture(['goip_sms_ctl'], { withoutListItems: true });
  assert.equal(profiles.detect(doc, modules).profile, 'sms');
});

test('returns unknown instead of guessing when no real menu evidence exists', () => {
  const result = profiles.detect(menuFixture([]), modules);
  assert.equal(result.profile, 'unknown');
  assert.deepEqual(result.smsEvidence, []);
  assert.deepEqual(result.voiceEvidence, []);
});

test('manual selection overrides detection and controls visible module families', () => {
  const list = modules.listModules();
  assert.equal(profiles.normalizePreference('invalid'), 'auto');
  assert.equal(profiles.resolveEffective('voice', 'sms'), 'voice');
  assert.equal(profiles.resolveEffective('auto', 'unknown'), 'unknown');
  assert.equal(profiles.modulesForProfile(list, 'sms').length, list.length);
  assert.deepEqual(profiles.modulesForProfile(list, 'unknown').map((module) => module.id), ['imei', 'save-reboot']);
  assert.ok(profiles.modulesForProfile(list, 'voice').every((module) => module.family !== 'sms'));
  assert.ok(profiles.modulesForProfile(list, 'voice').some((module) => module.family === 'voice'));
});
