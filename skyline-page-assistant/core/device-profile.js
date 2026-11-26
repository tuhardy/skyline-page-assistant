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

  function detect(doc, moduleRegistry) {
    const smsEvidence = SMS_EVIDENCE
      .filter((pages) => isLinkAvailable(findExactLink(doc, pages)))
      .map((pages) => pages[0].replace(/_(?:en|cn)\.html$/, ''));
    const voiceEvidence = moduleRegistry.listModules()
      .filter((module) => module.family === 'voice' && isModuleAvailable(doc, module))
      .map((module) => module.id);
    const profile = smsEvidence.length ? 'sms' : (voiceEvidence.length ? 'voice' : 'unknown');
    return { profile, smsEvidence, voiceEvidence };
  }

  function normalizePreference(value) {
    return ['auto', 'sms', 'voice'].includes(value) ? value : 'auto';
  }

  function resolveEffective(preference, detected) {
    const normalized = normalizePreference(preference);
    return normalized === 'auto' ? detected : normalized;
  }

  function modulesForProfile(modules, effectiveProfile) {
    if (effectiveProfile === 'sms') return modules.slice();
    if (effectiveProfile === 'voice') {
      return modules.filter((module) => module.family === 'common' || module.family === 'voice');
    }
    return modules.filter((module) => module.family === 'common');
  }

  return {
    detect,
    isModuleAvailable,
    modulesForProfile,
    normalizePreference,
    resolveEffective
  };
});
