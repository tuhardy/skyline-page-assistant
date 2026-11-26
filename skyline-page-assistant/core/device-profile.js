(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkylineDeviceProfile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SMS_EVIDENCE = [
    ['goip_sms_ctl_en.html', 'goip_sms_ctl_cn.html'],
    ['goip_sms_en.html', 'goip_sms_cn.html'],
    ['goip_sms_port_setting_en.html', 'goip_sms_port_setting_cn.html'],
    ['eims_settings_en.html', 'eims_settings_cn.html']
  ];

  function findExactLink(doc, pages) {
    if (!doc) return null;
    for (const page of pages) {
      const links = Array.from(doc.querySelectorAll(`a[target="right"][href="${page}"]`));
      const exact = links.find((link) => link.getAttribute('href') === page);
      if (exact) return exact;
    }
    return null;
  }

  function isLinkAvailable(link) {
    if (!link) return false;
    const item = link.closest('li');
    return !item || (!item.hidden && !item.classList.contains('MenuOff'));
  }

  function isModuleAvailable(doc, module) {
    return Boolean(module && isLinkAvailable(findExactLink(doc, module.pages)));
  }

  function classifyModelText(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return { profile: 'unknown', detail: '' };
    const sms = /\b(MP|MOIP)(?=\d|[^A-Za-z0-9_]|$)/i.exec(text);
    if (sms) return { profile: 'sms', detail: sms[1].toUpperCase() };
    const voice = /\b(GOIP|GP)(?=\d|[^A-Za-z0-9_]|$)/i.exec(text);
    if (voice) return { profile: 'voice', detail: voice[1].toUpperCase() === 'GOIP' ? 'GoIP' : 'GP' };
    const numeric = /\b([56]\d{2})(?=\s*(?:[-/]|\s|$))/.exec(text);
    if (numeric) {
      return {
        profile: numeric[1][0] === '6' ? 'sms' : 'voice',
        detail: numeric[1]
      };
    }
    return { profile: 'unknown', detail: '' };
  }

  function classifySoftwareVersion(value) {
    const text = String(value || '').trim();
    if (!text) return { profile: 'unknown', detail: '' };
    const model = /\b([56]\d{2})(?=-)/.exec(text);
    if (model) {
      return {
        profile: model[1][0] === '6' ? 'sms' : 'voice',
        detail: model[1]
      };
    }
    const prefix = /^([56])/.exec(text);
    if (prefix) {
      return {
        profile: prefix[1] === '6' ? 'sms' : 'voice',
        detail: prefix[1]
      };
    }
    return { profile: 'unknown', detail: '' };
  }

  function detect(doc, moduleRegistry, hints = {}) {
    const model = classifyModelText(hints.modelText);
    if (model.profile !== 'unknown') {
      return { profile: model.profile, source: 'model', detail: model.detail, smsEvidence: [], voiceEvidence: [] };
    }
    const software = classifySoftwareVersion(hints.softwareVersion);
    if (software.profile !== 'unknown') {
      return { profile: software.profile, source: 'software', detail: software.detail, smsEvidence: [], voiceEvidence: [] };
    }
    const smsEvidence = SMS_EVIDENCE
      .filter((pages) => isLinkAvailable(findExactLink(doc, pages)))
      .map((pages) => pages[0].replace(/_(?:en|cn)\.html$/, ''));
    const voiceEvidence = moduleRegistry.listModules()
      .filter((module) => module.family === 'voice' && isModuleAvailable(doc, module))
      .map((module) => module.id);
    const profile = smsEvidence.length ? 'sms' : (voiceEvidence.length ? 'voice' : 'unknown');
    return {
      profile,
      source: profile === 'unknown' ? 'none' : 'menu',
      detail: profile === 'sms' ? 'SMS 菜单' : (profile === 'voice' ? '语音菜单' : ''),
      smsEvidence,
      voiceEvidence
    };
  }

  function normalizePreference(value) {
    return ['auto', 'sms', 'voice'].includes(value) ? value : 'auto';
  }

  function resolveEffective(preference, detected) {
    const normalized = normalizePreference(preference);
    return normalized === 'auto' ? detected : normalized;
  }

  function modulesForProfile(modules, effectiveProfile) {
    if (effectiveProfile === 'sms') {
      return modules.filter((module) => module.family === 'common' || module.family === 'sms');
    }
    return modules.slice();
  }

  return {
    classifyModelText,
    classifySoftwareVersion,
    detect,
    isModuleAvailable,
    modulesForProfile,
    normalizePreference,
    resolveEffective
  };
});
