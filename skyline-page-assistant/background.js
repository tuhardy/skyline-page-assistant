const PENDING_KEY = 'skyline.imei.pending';
const ETMS_PENDING_KEY = 'skyline.etms.pending';
const EIMS_PENDING_KEY = 'skyline.eims.pending';
const PROFILE_KEY = 'skyline.device-profile.preferences';
const PROFILE_PREFERENCES = ['auto', 'sms', 'voice'];
const UI_PREFS_KEY = 'skyline.ui.preferences';
const UI_LANGS = ['auto', 'zh', 'en'];

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'skyline.toggle-panel' }, () => {
    // Unsupported pages and closed frames have no receiver; no action is needed.
    void chrome.runtime.lastError;
  });
});

// chrome.storage.session is not exposed to content scripts by default. Keep it
// behind a narrow background broker instead of widening its access level.
// Pending records never include ETMS/EIMS passwords; only non-secret readback facts are stored.
// Keep preferences behind a fixed-key broker. The only accepted values are
// auto/sms/voice; device credentials, menus and configuration are never stored.
// UI preferences are equally narrow: fan pin ids and a language choice only.
function sanitizeUiPrefs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const pinned = Array.isArray(value.pinned)
    ? [...new Set(value.pinned.filter((id) => typeof id === 'string' && /^[a-z0-9-]{1,40}$/i.test(id)))].slice(0, 4)
    : [];
  const lang = UI_LANGS.includes(value.lang) ? value.lang : 'auto';
  return { pinned, lang };
}

function profileOrigin(sender) {
  const url = new URL(sender && sender.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('不支持的设备页面来源。');
  return url.origin;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;
  let operation;
  if (message.key === PROFILE_KEY && (message.type === 'skyline.profile.get' || message.type === 'skyline.profile.set')) {
    try {
      const origin = profileOrigin(sender);
      if (message.type === 'skyline.profile.set' && !PROFILE_PREFERENCES.includes(message.value)) {
        throw new Error('无效的设备类型偏好。');
      }
      operation = chrome.storage.local.get(PROFILE_KEY).then((items) => {
        const saved = items[PROFILE_KEY];
        const preferences = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {};
        if (message.type === 'skyline.profile.get') {
          return PROFILE_PREFERENCES.includes(preferences[origin]) ? preferences[origin] : 'auto';
        }
        preferences[origin] = message.value;
        return chrome.storage.local.set({ [PROFILE_KEY]: preferences }).then(() => message.value);
      });
    } catch (error) {
      operation = Promise.reject(error);
    }
  } else if (message.key === UI_PREFS_KEY && (message.type === 'skyline.ui.get' || message.type === 'skyline.ui.set')) {
    try {
      const origin = profileOrigin(sender);
      operation = chrome.storage.local.get(UI_PREFS_KEY).then((items) => {
        const saved = items[UI_PREFS_KEY];
        const all = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {};
        if (message.type === 'skyline.ui.get') {
          return sanitizeUiPrefs(all[origin]);
        }
        const prefs = sanitizeUiPrefs(message.value);
        if (!prefs) throw new Error('无效的界面偏好。');
        all[origin] = prefs;
        return chrome.storage.local.set({ [UI_PREFS_KEY]: all }).then(() => prefs);
      });
    } catch (error) {
      operation = Promise.reject(error);
    }
  } else if (message.key === PENDING_KEY || message.key === ETMS_PENDING_KEY || message.key === EIMS_PENDING_KEY) {
    if (message.type === 'skyline.pending.get') {
      operation = chrome.storage.session.get(message.key).then((items) => items[message.key]);
    } else if (message.type === 'skyline.pending.set') {
      operation = chrome.storage.session.set({ [message.key]: message.value });
    } else if (message.type === 'skyline.pending.remove') {
      operation = chrome.storage.session.remove(message.key);
    } else {
      return;
    }
  } else {
    return;
  }
  operation.then(
    (value) => sendResponse({ ok: true, value }),
    (error) => sendResponse({ ok: false, error: error.message })
  );
  return true;
});
