(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkylineModules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODULES = [
    {
      id: 'imei',
      name: 'IMEI 修改',
      capability: 'operation',
      family: 'common',
      pages: ['goip_imei_en.html', 'goip_imei_cn.html']
    },
    {
      id: 'etms-registration',
      name: 'ETMS 注册',
      capability: 'operation',
      family: 'sms',
      pages: ['user_management_en.html', 'user_management_cn.html']
    },
    {
      id: 'eims-settings',
      name: 'EIMS 注册',
      capability: 'operation',
      family: 'sms',
      pages: ['eims_settings_en.html', 'eims_settings_cn.html']
    },
    {
      id: 'sms-control',
      name: 'SMS 控制',
      capability: 'navigation',
      family: 'sms',
      pages: ['goip_sms_ctl_en.html', 'goip_sms_ctl_cn.html']
    },
    {
      id: 'call-duration',
      name: '通话时长限制',
      capability: 'navigation',
      family: 'voice',
      pages: ['call_dur_ctl_en.html', 'call_dur_ctl_cn.html']
    },
    {
      id: 'call-count',
      name: '呼叫次数控制',
      capability: 'navigation',
      family: 'voice',
      pages: ['goip_calls_ctl_en.html', 'goip_calls_ctl_cn.html']
    },
    {
      id: 'talk-numbers',
      name: '通话号码控制',
      capability: 'navigation',
      family: 'voice',
      pages: ['goip_talks_ctl_en.html', 'goip_talks_ctl_cn.html']
    },
    {
      id: 'call-control',
      name: '呼叫控制设置',
      capability: 'navigation',
      family: 'voice',
      pages: ['call_ctrl_setting_en.html', 'call_ctrl_setting_cn.html']
    },
    {
      id: 'save-reboot',
      name: '保存 / 重启',
      capability: 'guide',
      family: 'common',
      pages: ['save_reboot_en.html', 'save_reboot_cn.html']
    }
  ].map((module) => Object.freeze({ ...module, pages: Object.freeze(module.pages) }));

  function getModule(id) {
    return MODULES.find((module) => module.id === id) || null;
  }

  function listModules() {
    return MODULES.slice();
  }

  function matchLocation(locationLike) {
    const pathname = locationLike && locationLike.pathname;
    if (!pathname) return null;
    const page = pathname.split('/').pop();
    return MODULES.find((module) => module.pages.includes(page)) || null;
  }

  function findMenuLink(doc, moduleOrId) {
    const module = typeof moduleOrId === 'string' ? getModule(moduleOrId) : moduleOrId;
    if (!module || !doc) return null;
    for (const page of module.pages) {
      const links = Array.from(doc.querySelectorAll(`a[target="right"][href="${page}"]`));
      const exact = links.find((link) => link.getAttribute('href') === page);
      if (exact) return exact;
    }
    return null;
  }

  return {
    findMenuLink,
    getModule,
    listModules,
    matchLocation
  };
});
