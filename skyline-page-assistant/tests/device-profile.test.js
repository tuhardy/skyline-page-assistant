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

test('classifies top-right model text before menu evidence', () => {
  const doc = menuFixture(['goip_sms_ctl', 'goip_calls_ctl']);
  const voice = profiles.detect(doc, modules, { modelText: 'sk GoIP16/512 Version: 6.9x' });
  assert.equal(voice.profile, 'voice');
  assert.equal(voice.source, 'model');
  assert.equal(voice.detail, 'GoIP');
  const sms = profiles.detect(doc, modules, { modelText: 'MP 664 ESIM V8.5' });
  assert.equal(sms.profile, 'sms');
  assert.equal(sms.source, 'model');
  assert.equal(sms.detail, 'MP');
});

test('parses model aliases and numeric prefixes without treating port counts as models', () => {
  assert.deepEqual(profiles.classifyModelText('MOIP 632'), { profile: 'sms', detail: 'MOIP' });
  assert.deepEqual(profiles.classifyModelText('GP 532'), { profile: 'voice', detail: 'GP' });
  assert.deepEqual(profiles.classifyModelText('664-805-900-E041-100-000'), { profile: 'sms', detail: '664' });
  assert.deepEqual(profiles.classifyModelText('GoIP16/512 Version: 6.9x'), { profile: 'voice', detail: 'GoIP' });
  assert.deepEqual(profiles.classifyModelText('TOP 192.168.90.242'), { profile: 'unknown', detail: '' });
});

test('uses software version before menu evidence when the header is unavailable', () => {
  const doc = menuFixture(['goip_sms_ctl', 'goip_calls_ctl']);
  const voice = profiles.detect(doc, modules, { softwareVersion: '516-609-924-941-100-000' });
  assert.equal(voice.profile, 'voice');
  assert.equal(voice.source, 'software');
  assert.equal(voice.detail, '516');
  const sms = profiles.detect(menuFixture([]), modules, { softwareVersion: '664-805-900-E041-100-000' });
  assert.equal(sms.profile, 'sms');
  assert.equal(sms.source, 'software');
  assert.equal(sms.detail, '664');
});

test('detects an SMS device from menus even when voice menus are also available', () => {
  const doc = menuFixture(['goip_sms_ctl', 'eims_settings', 'goip_calls_ctl', 'call_dur_ctl']);
  const result = profiles.detect(doc, modules);
  assert.equal(result.profile, 'sms');
  assert.equal(result.source, 'menu');
  assert.deepEqual(result.smsEvidence, ['goip_sms_ctl', 'eims_settings']);
  assert.deepEqual(result.voiceEvidence, ['call-duration', 'call-count']);
});

test('detects a voice device only when SMS evidence is unavailable', () => {
  const doc = menuFixture(['goip_calls_ctl', 'goip_talks_ctl', 'call_ctrl_setting']);
  const result = profiles.detect(doc, modules);
  assert.equal(result.profile, 'voice');
  assert.equal(result.source, 'menu');
  assert.equal(result.smsEvidence.length, 0);
  assert.equal(result.voiceEvidence.length, 3);
});

test('collapsed menu sections do not hide supported capabilities', () => {
  const doc = menuFixture(['goip_sms_ctl'], { withoutListItems: true });
  assert.equal(profiles.detect(doc, modules).profile, 'sms');
});

test('returns unknown instead of guessing when no real evidence exists', () => {
  const result = profiles.detect(menuFixture([]), modules);
  assert.equal(result.profile, 'unknown');
  assert.equal(result.source, 'none');
  assert.deepEqual(result.smsEvidence, []);
  assert.deepEqual(result.voiceEvidence, []);
});

test('manual selection overrides detection and controls visible module families', () => {
  const list = modules.listModules();
  assert.equal(profiles.normalizePreference('invalid'), 'auto');
  assert.equal(profiles.resolveEffective('voice', 'sms'), 'voice');
  assert.equal(profiles.resolveEffective('auto', 'unknown'), 'unknown');
  assert.deepEqual(
    profiles.modulesForProfile(list, 'sms').map((module) => module.id),
    ['imei', 'etms-registration', 'eims-settings', 'sms-control', 'save-reboot'],
    'SMS devices must not show voice controls'
  );
  assert.equal(profiles.modulesForProfile(list, 'voice').length, list.length, 'voice devices include SMS and voice controls');
  assert.equal(profiles.modulesForProfile(list, 'unknown').length, list.length, 'unknown devices stay open and are validated on click');
  assert.ok(profiles.modulesForProfile(list, 'voice').some((module) => module.family === 'sms'));
  assert.ok(profiles.modulesForProfile(list, 'voice').some((module) => module.family === 'voice'));
});
