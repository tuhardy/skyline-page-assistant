(function () {
  'use strict';

  const imei = globalThis.SkylineImei;
  const moduleRegistry = globalThis.SkylineModules;
  const deviceProfile = globalThis.SkylineDeviceProfile;
  const etms = globalThis.SkylineEtms;
  const isMainPage = /^\/main_(?:en|cn)\.html$/.test(location.pathname);
  const isDirectImeiPage = /^\/goip_imei_(?:en|cn)\.html$/.test(location.pathname);
  if (!imei || !moduleRegistry || !etms || (isMainPage && !deviceProfile) || (!isMainPage && !isDirectImeiPage) || window !== window.top) return;

  const STORAGE_KEY = 'skyline.imei.pending';
  const ETMS_STORAGE_KEY = 'skyline.etms.pending';
  const PROFILE_KEY = 'skyline.device-profile.preferences';
  const HIGHLIGHT_CLASS = 'skyline-page-assistant-highlight';
  const BADGE_CLASS = 'skyline-page-assistant-step-badge';
  let pageDocument = null;
  let pageWindow = null;
  let controls = [];
  let highlighted = null;
  let highlightedWindow = null;
  let badge = null;
  let badgeTarget = null;
  let submitting = false;
  let verificationTimer = null;
  let verificationSequence = 0;
  let etmsSubmitting = false;
  let etmsVerificationTimer = null;
  let etmsVerificationSequence = 0;
  let etmsStatusRefreshAt = 0;
  let activeModule = null;
  let profilePreference = 'auto';
  let detectedProfile = 'unknown';
  let detectedProfileDetail = '';
  let effectiveProfile = 'unknown';
  let softwareVersion = '';
  let softwareDetectionState = 'idle';
  let profileDetectionStartedAt = Date.now();
  let moduleSignature = '';
  let profileChangeSequence = 0;

  function profileStorage(action, value) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: `skyline.profile.${action}`,
        key: PROFILE_KEY,
        value
      }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else if (!response || !response.ok) reject(new Error((response && response.error) || '扩展后台未能处理设备类型偏好。'));
        else resolve(response.value);
      });
    });
  }

  function pendingStorage(action, value, key = STORAGE_KEY) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: `skyline.pending.${action}`,
        key,
        value
      }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else if (!response || !response.ok) reject(new Error((response && response.error) || '扩展后台未能处理待回读记录。'));
        else resolve(response.value);
      });
    });
  }

  function findMainIndexDocument() {
    const outer = Array.from(document.querySelectorAll('iframe')).find((frame) => (
      /mainindex_(?:en|cn)\.html$/.test(frame.src)
    )) || document.querySelector('iframe');
    if (!outer) return null;
    try {
      return outer.contentDocument;
    } catch (_) {
      return null;
    }
  }

  function findFrame(name) {
    const mainIndexDocument = findMainIndexDocument();
    return mainIndexDocument && mainIndexDocument.querySelector(`frame[name="${name}"]`);
  }

  function findTopFrame() {
    const mainIndexDocument = findMainIndexDocument();
    if (!mainIndexDocument) return null;
    return mainIndexDocument.querySelector('frame[name="top"]')
      || Array.from(mainIndexDocument.querySelectorAll('frame')).find((frame) => (
        /main_top_(?:en|cn)\.html(?:[?#]|$)/.test(frame.src)
      ))
      || null;
  }

  function readTopModelText() {
    const topFrame = findTopFrame();
    if (!topFrame) return '';
    try {
      const topDocument = topFrame.contentDocument;
      const link = topDocument.querySelector('.top_info_link');
      const rendered = (link && link.textContent) || '';
      const scripts = Array.from(topDocument.scripts).map((script) => script.textContent).join('\n');
      const match = /short_version\s*=\s*"([^"]+)"/.exec(scripts);
      const modelText = [rendered, match && match[1]].filter(Boolean).join(' ').trim();
      if (modelText) return modelText;
      return (topDocument.body && topDocument.body.innerText) || '';
    } catch (_) {
      return '';
    }
  }

  async function fetchSoftwareVersion() {
    const statusPage = /_cn\.html$/.test(location.pathname) ? 'device_status_cn.html' : 'device_status_en.html';
    try {
      const response = await fetch(statusPage, { credentials: 'same-origin', cache: 'no-store' });
      if (response.ok) {
        const html = await response.text();
        const match = /\b[56]\d{2}(?:-[A-Za-z0-9]+)+/.exec(html);
        if (match) return match[0];
      }
    } catch (_) {
      // The dynamic status page does not contain the version; try its read-only data endpoint below.
    }
    try {
      const response = await fetch('get_parameter.html', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ type: 'sysStatus', target: 'dev_info' })
      });
      if (!response.ok) return '';
      const data = await response.json();
      return data && data.dev_info && typeof data.dev_info.sw_ver === 'string' ? data.dev_info.sw_ver : '';
    } catch (_) {
      return '';
    }
  }

  function loadSoftwareVersion() {
    if (softwareDetectionState !== 'idle') return;
    softwareDetectionState = 'loading';
    fetchSoftwareVersion().then((version) => {
      softwareVersion = version;
      softwareDetectionState = version ? 'loaded' : 'failed';
      syncProfile();
    }).catch(() => {
      softwareDetectionState = 'failed';
    });
  }

  function realButton(action) {
    return pageDocument && imei.findBatchButton(pageDocument, action);
  }

  function realSubmitButton() {
    return pageDocument && (pageDocument.querySelector('#GoipPortImeiConfigBox form[name="form1"] input[type="submit"]')
      || pageDocument.querySelector('form[name="form1"] input[type="submit"]'));
  }

  function modeRadio() {
    return pageDocument && pageDocument.querySelector('#imeiDisplayType0_ID');
  }

  function firstEditableControl(selection) {
    try {
      const requested = selection || panel.getBatchSelection();
      const selected = imei.selectBatchControls(
        controls,
        requested.startPort,
        requested.endPort,
        requested.slotCount
      );
      const targets = requested.scope === 'all'
        ? selected
        : selected.filter((control) => control.value === '');
      return targets[0] || null;
    } catch (_) {
      return null;
    }
  }

  function dispatchInput(control) {
    control.element.dispatchEvent(new pageWindow.Event('input', { bubbles: true }));
    control.element.dispatchEvent(new pageWindow.Event('change', { bubbles: true }));
  }

  function clearHighlight() {
    if (highlighted) highlighted.classList.remove(HIGHLIGHT_CLASS);
    highlighted = null;
    badgeTarget = null;
    if (badge) badge.remove();
    badge = null;
    if (highlightedWindow) {
      highlightedWindow.removeEventListener('scroll', positionBadge, true);
      highlightedWindow.removeEventListener('resize', positionBadge);
    }
    highlightedWindow = null;
  }

  function positionBadge() {
    if (!badge || !badgeTarget || !badgeTarget.isConnected) return;
    const rect = badgeTarget.getBoundingClientRect();
    const ownerWindow = badgeTarget.ownerDocument.defaultView;
    const badgeWidth = badge.offsetWidth || 180;
    const left = Math.max(4, Math.min(rect.left, ownerWindow.innerWidth - badgeWidth - 4));
    const top = rect.top > 42
      ? rect.top - 34
      : Math.min(ownerWindow.innerHeight - 32, rect.bottom + 6);
    badge.style.left = `${left}px`;
    badge.style.top = `${Math.max(4, top)}px`;
  }

  function installAssistantStyles(targetDocument) {
    const style = targetDocument.createElement('style');
    style.textContent = `
      .${HIGHLIGHT_CLASS} { outline: 3px solid #ff9f1c !important; outline-offset: 3px !important; box-shadow: 0 0 0 6px rgba(255,159,28,.18) !important; }
      .${BADGE_CLASS} { position: fixed; z-index: 2147483646; max-width: 310px; padding: 5px 9px; border-radius: 5px; color: #fff; background: #d66b00; box-shadow: 0 3px 10px rgba(0,0,0,.25); font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; pointer-events: none; }
    `;
    (targetDocument.head || targetDocument.documentElement).appendChild(style);
  }

  function highlightIn(targetDocument, targetWindow, element, step, label, scroll = true) {
    clearHighlight();
    if (!element) return;
    highlighted = element;
    highlightedWindow = targetWindow;
    badgeTarget = element;
    element.classList.add(HIGHLIGHT_CLASS);
    badge = targetDocument.createElement('div');
    badge.className = BADGE_CLASS;
    badge.style.cssText = 'all: initial; display: block; position: fixed; z-index: 2147483646; box-sizing: border-box; width: max-content; max-width: 310px; padding: 5px 9px; border-radius: 5px; color: #fff; background: #d66b00; box-shadow: 0 3px 10px rgba(0,0,0,.25); font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; pointer-events: none;';
    badge.textContent = `第 ${step} 步 · ${label}`;
    (targetDocument.body || targetDocument.documentElement).appendChild(badge);
    targetWindow.addEventListener('scroll', positionBadge, true);
    targetWindow.addEventListener('resize', positionBadge);
    if (scroll) element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    positionBadge();
    targetWindow.setTimeout(positionBadge, 350);
  }

  function highlight(element, step, label, scroll = true) {
    if (pageDocument && pageWindow) highlightIn(pageDocument, pageWindow, element, step, label, scroll);
  }

  function selectedControl() {
    const selection = panel.getSelection();
    return imei.findControl(controls, selection.port, selection.slot);
  }

  function snapshotControls() {
    return controls.map((control) => ({ name: control.name, value: control.value }));
  }

  function assertSnapshotMatches(snapshot, message) {
    const current = new Map(controls.map((control) => [control.name, control.value]));
    const changed = !Array.isArray(snapshot)
      || snapshot.length !== controls.length
      || current.size !== controls.length
      || snapshot.some((item) => !current.has(item.name) || current.get(item.name) !== item.value);
    if (changed) throw new Error(message);
  }

  function restoreInputSnapshot(snapshot) {
    const byName = new Map(controls.map((control) => [control.name, control]));
    if (snapshot.some((saved) => !byName.has(saved.name))) {
      throw new Error('页面输入框集合已变化，不能完整恢复快照。');
    }
    snapshot.forEach((saved) => {
      const control = byName.get(saved.name);
      control.element.value = saved.value;
      dispatchInput(control);
    });
    controls = imei.collectImeiControls(pageDocument);
  }

  function readPage() {
    controls = imei.collectImeiControls(pageDocument);
    const mode = imei.getMode(pageDocument);
    panel.setPage(mode, controls);
    if (mode !== 0) {
      panel.setResult('info', '当前模式不允许直接编辑端口 IMEI。请先查看第 1 步；助手不会擅自切换模式。');
    } else {
      panel.setResult('info', `已读取 ${controls.length} 个真实 IMEI 输入框。请选择单个或批量修改。`);
    }
  }

  function revealMenuLink(targetWindow, link) {
    const submenu = link.closest('.menuSub');
    const menu = link.closest('.leftMenu');
    const header = menu && menu.querySelector('.menuHdr');
    if (submenu && header && targetWindow.getComputedStyle(submenu).display === 'none') {
      header.click();
    }
  }

  function canLeaveCurrentPage() {
    if (panel.plan && !panel.plan.attempted) {
      panel.setResult('unconfirmed', '当前预览尚未完成，请先取消或确认真实 Submit。');
      return false;
    }
    if (panel.etmsPlan && !panel.etmsPlan.attempted) {
      panel.setResult('unconfirmed', '当前 ETMS 预览尚未完成，请先取消或确认真实 Submit。');
      return false;
    }
    return true;
  }

  function syncProfile() {
    if (!isMainPage) return;
    let detection = { profile: 'unknown', source: 'none', detail: '' };
    const modelText = readTopModelText();
    const leftFrame = findFrame('left');
    try {
      detection = deviceProfile.detect(
        leftFrame ? leftFrame.contentDocument : null,
        moduleRegistry,
        { modelText, softwareVersion }
      );
    } catch (_) {
      // A menu that is still loading is insufficient evidence, not a voice device.
    }
    if (
      (detection.source === 'menu' || detection.profile === 'unknown')
      && softwareDetectionState === 'idle'
      && Date.now() - profileDetectionStartedAt >= 1500
    ) {
      loadSoftwareVersion();
    }
    detectedProfile = detection.profile;
    detectedProfileDetail = detection.detail || '';
    effectiveProfile = deviceProfile.resolveEffective(profilePreference, detectedProfile);
    panel.setProfileState(profilePreference, detectedProfile, effectiveProfile, detectedProfileDetail);
    const visibleModules = deviceProfile.modulesForProfile(moduleRegistry.listModules(), effectiveProfile);
    const signature = visibleModules.map((module) => module.id).join('|');
    if (signature !== moduleSignature) {
      moduleSignature = signature;
      panel.setModules(visibleModules);
      if (!pageDocument && activeModule && !visibleModules.some((module) => module.id === activeModule.id)) {
        activeModule = null;
        panel.showModules();
      }
    }
  }

  async function loadProfilePreference() {
    const sequence = profileChangeSequence;
    let loadedPreference = 'auto';
    try {
      loadedPreference = deviceProfile.normalizePreference(await profileStorage('get'));
    } catch (_) {
      loadedPreference = 'auto';
    }
    if (sequence === profileChangeSequence) profilePreference = loadedPreference;
    syncProfile();
  }

  function openModule(moduleId) {
    const module = moduleRegistry.getModule(moduleId);
    if (!module) {
      panel.setResult('failure', '未找到该内置功能模块。');
      return;
    }
    if (module.capability === 'guide') {
      locateReboot();
      return;
    }
    if (!canLeaveCurrentPage()) return;
    const leftFrame = findFrame('left');
    if (!leftFrame) {
      panel.setResult('unconfirmed', '当前页面没有真实左侧菜单，未执行导航。');
      return;
    }
    try {
      const leftWindow = leftFrame.contentWindow;
      const leftDocument = leftFrame.contentDocument;
      const link = moduleRegistry.findMenuLink(leftDocument, module);
      if (!link || !deviceProfile.isModuleAvailable(leftDocument, module)) throw new Error('missing or unavailable menu');
      revealMenuLink(leftWindow, link);
      highlightIn(leftDocument, leftWindow, link, 1, `打开${module.name}`, true);
      activeModule = module;
      link.click();
      if (module.id !== 'imei') panel.showModules(module.id, module);
      panel.setResult('info', `已点击真实“${module.name}”菜单，等待右侧页面返回。`);
    } catch (_) {
      panel.setResult('unconfirmed', `未在真实左侧菜单找到可用的“${module.name}”，未执行导航。`);
    }
  }

  function locateReboot() {
    const leftFrame = findFrame('left');
    if (!leftFrame) {
      panel.setResult('unconfirmed', '当前是直接打开的功能页，没有左侧真实菜单。请回到 main_en.html 后使用保存/重启指导。');
      return;
    }
    try {
      const leftWindow = leftFrame.contentWindow;
      const leftDocument = leftFrame.contentDocument;
      const link = moduleRegistry.findMenuLink(leftDocument, 'save-reboot');
      if (!link || !deviceProfile.isModuleAvailable(leftDocument, moduleRegistry.getModule('save-reboot'))) throw new Error('missing or unavailable menu');
      revealMenuLink(leftWindow, link);
      const onImeiPage = Boolean(pageDocument && !panel.imeiWorkspace.hidden);
      const lastStep = panel.workflow === 'batch' ? 6 : 4;
      const badgeStep = onImeiPage ? lastStep : 1;
      if (onImeiPage) panel.setStep(lastStep);
      highlightIn(leftDocument, leftWindow, link, badgeStep, '点击 Save and Reboot；进入后仍需单独确认', true);
      panel.setResult('info', '已定位真实 Save and Reboot 菜单。保存/重启可能中断连接，本版本不会自动点击或自动重启。');
    } catch (_) {
      panel.setResult('unconfirmed', '未在真实左侧菜单找到 Save and Reboot，未执行任何操作。');
    }
  }

  function readEtmsPage() {
    const current = etms.readCurrent(pageDocument);
    if (!current) throw new Error('未找到 ETMS 设备网管表单。');
    panel.setEtmsPage(current);
    return current;
  }

  function etmsStepTarget(step) {
    const current = etms.readCurrent(pageDocument);
    if (!current) return null;
    const elements = current.elements;
    if (step === 1) return pageDocument.querySelector('#ID_EjoinRemMgmtBox_Body') || pageDocument.querySelector('#EjoinRemMgmtBox');
    if (step === 2) return elements.radios.find((radio) => Number(radio.value) === etms.ETMS_TYPE) || elements.checked;
    if (step === 3) return elements.server;
    if (step === 4) return elements.submit;
    return elements.status;
  }

  function highlightEtmsStep(step, scroll = true) {
    const labels = {
      1: '确认设备网管区块',
      2: '选择 ETMS 网管类型',
      3: '在真实表单填写服务器、端口、账号、密码',
      4: '核对预览后点击真实 Submit',
      5: '等待状态回读为 OK'
    };
    panel.setEtmsStep(step);
    highlight(etmsStepTarget(step), step, labels[step] || 'ETMS 注册', scroll);
  }

  // ETMS 状态由设备页面异步刷新（注册成功后再回到本页时，附加瞬间状态往往还没就绪），
  // 工作区激活期间每秒同步一次当前状态行；只读页面、只更新显示，不触碰表单和预览。
  function refreshEtmsStatus() {
    if (etmsSubmitting || !pageDocument) return;
    const now = Date.now();
    if (now - etmsStatusRefreshAt < 1000) return;
    etmsStatusRefreshAt = now;
    const current = etms.readCurrent(pageDocument);
    if (current) panel.refreshEtmsCurrent(current);
  }

  function scheduleEtmsVerification(targetDocument, delay) {
    if (etmsVerificationTimer) clearTimeout(etmsVerificationTimer);
    const sequence = ++etmsVerificationSequence;
    etmsVerificationTimer = setTimeout(() => {
      if (sequence !== etmsVerificationSequence || targetDocument !== pageDocument) return;
      verifyEtmsPending(targetDocument).catch((error) => {
        etmsSubmitting = false;
        panel.setBusy(false);
        panel.setResult('unconfirmed', `ETMS 回读处理失败：${error.message}。请人工核对真实页面。`);
      });
    }, delay);
  }

  async function verifyEtmsPending(targetDocument) {
    if (targetDocument !== pageDocument || !pageWindow) return;
    const pending = await pendingStorage('get', null, ETMS_STORAGE_KEY);
    if (targetDocument !== pageDocument) return;
    if (!pending || pending.kind !== 'etms' || pending.origin !== pageWindow.location.origin || pending.path !== pageWindow.location.pathname) return;
    if (Date.now() - pending.createdAt > 15 * 60 * 1000) {
      await pendingStorage('remove', null, ETMS_STORAGE_KEY);
      etmsSubmitting = false;
      panel.setBusy(false);
      panel.clearEtmsPreview();
      panel.setResult('unconfirmed', '一次 ETMS 注册已超过 15 分钟，停止自动回读。请人工检查真实页面状态。');
      return;
    }
    const current = etms.readCurrent(pageDocument);
    panel.setEtmsPage(current);
    panel.setEtmsStep(5);
    const result = etms.evaluateRegistrationReadback(pending, current);
    etmsSubmitting = false;
    panel.setBusy(false);
    if (result.status === 'success') {
      panel.clearEtmsPreview();
      panel.setEtmsStep(5);
      panel.setResult('success', result.message);
      highlight(current && current.elements.status, 5, 'ETMS 状态 OK', false);
      await pendingStorage('remove', null, ETMS_STORAGE_KEY);
      return;
    }
    if (result.status === 'failure') {
      panel.clearEtmsPreview();
      panel.setResult('failure', result.message);
      highlight(current && current.elements.status, 5, 'ETMS 回读不一致', false);
      await pendingStorage('remove', null, ETMS_STORAGE_KEY);
      return;
    }
    if (pending.attempts < 12) {
      pending.attempts += 1;
      await pendingStorage('set', pending, ETMS_STORAGE_KEY);
      panel.setResult('unconfirmed', `${result.message} ${(pending.attempts * 2.5).toFixed(1)} 秒后重读（第 ${pending.attempts}/12 次）。`);
      highlight(current && current.elements.status, 5, '等待 ETMS 状态 OK', false);
      scheduleEtmsVerification(targetDocument, 2500);
      return;
    }
    await pendingStorage('remove', null, ETMS_STORAGE_KEY);
    panel.clearEtmsPreview();
    panel.setResult('unconfirmed', `${result.message} 已等待约 30 秒，请人工核对 ETMS 状态。`);
  }

  async function submitEtmsChanges(plan) {
    if (etmsSubmitting) return;
    const current = etms.readCurrent(pageDocument);
    if (!current) throw new Error('真实 ETMS 表单已不存在，未执行提交。');
    if (!etms.snapshotsEqual(plan.snapshot, etms.snapshot(current))) {
      throw new Error('预览后真实表单已变化，已停止 Submit。请重新生成预览。');
    }
    if (current.type !== etms.ETMS_TYPE) {
      throw new Error('真实表单的网管类型已不是 ETMS，已停止 Submit。');
    }
    if (!current.passwordFilled) {
      throw new Error('真实密码框已为空，请在真实表单重新填写密码后再提交。');
    }
    const submittedDocument = pageDocument;
    const pending = {
      version: 1,
      kind: 'etms',
      origin: pageWindow.location.origin,
      path: pageWindow.location.pathname,
      expected: {
        type: etms.ETMS_TYPE,
        server: plan.server,
        port: String(plan.port),
        account: plan.account
      },
      attempts: 0,
      createdAt: Date.now()
    };
    await pendingStorage('set', pending, ETMS_STORAGE_KEY);
    if (pageDocument !== submittedDocument) {
      await pendingStorage('remove', null, ETMS_STORAGE_KEY);
      throw new Error('等待写入回读记录时真实页面已变化，未点击 Submit。请重新识别页面并预览。');
    }
    etmsSubmitting = true;
    panel.setBusy(true);
    panel.markEtmsAttempted();
    panel.setEtmsStep(5);
    panel.setResult('info', '正在点击真实表单原有的 Submit。结果必须等待状态回读为 OK。');
    highlight(current.elements.submit, 4, '已调用真实 Submit，等待状态 OK', false);
    current.elements.submit.click();
    scheduleEtmsVerification(submittedDocument, 1000);
  }

  const panel = new globalThis.SkylinePanel({
    onWorkflowChange(workflow) {
      if (panel.plan && panel.plan.kind === 'batch') {
        panel.setResult('unconfirmed', '当前批量预览仍占用页面输入框。请先“取消预览”恢复快照，或核对后确认 Submit，再切换功能。');
        return;
      }
      panel.setWorkflow(workflow);
      const step = 1;
      highlight(modeRadio(), step, '确认“指定 IMEI 前缀”模式', false);
    },
    onStep(step) {
      panel.setStep(step);
      if (step === 1) {
        highlight(modeRadio(), 1, '确认“指定 IMEI 前缀”模式');
        return;
      }
      if ((panel.workflow === 'single' && step === 4) || (panel.workflow === 'batch' && step === 6)) {
        locateReboot();
        return;
      }
      if (panel.workflow === 'single') {
        if (step === 2) {
          const control = selectedControl();
          highlight(control && control.element, 2, '在这个真实输入框填写 IMEI');
        } else {
          highlight(realSubmitButton(), 3, '核对预览后点击真实 Submit');
        }
        return;
      }
      if (step === 2) {
        const seed = firstEditableControl();
        highlight(seed && seed.element, 2, '范围起点：在这里填入前 8 位');
      } else if (step === 3) {
        highlight(realButton('Copy'), 3, '真实 Copy：填充其他空白框');
      } else if (step === 4) {
        highlight(realButton('AutoComplete'), 4, '真实 Auto Complete：随机补齐并计算校验位');
      } else {
        highlight(realSubmitButton(), 5, '核对全部变更后点击真实 Submit');
      }
    },
    onEtmsStep(step) {
      if (!pageDocument || !activeModule || activeModule.id !== 'etms-registration') {
        openModule('etms-registration');
        return;
      }
      highlightEtmsStep(step);
    },
    onEtmsPreview() {
      try {
        const current = etms.readCurrent(pageDocument);
        if (!current) throw new Error('当前页面不是可识别的 ETMS 设备网管页面。');
        const plan = etms.createChangePlan(current);
        panel.setEtmsPreview(plan);
        highlightEtmsStep(4, false);
      } catch (error) {
        panel.setResult('failure', error.message);
      }
    },
    onEtmsCancel() {
      panel.clearEtmsPreview();
      panel.setEtmsStep(3);
      panel.setResult('info', '已取消 ETMS 预览；未点击 Submit，真实表单保持你填写的内容。');
      highlightEtmsStep(3, false);
    },
    onEtmsExecute(plan) {
      submitEtmsChanges(plan).catch((error) => {
        etmsSubmitting = false;
        panel.setBusy(false);
        panel.setResult('failure', error.message);
      });
    },
    onTargetChange() {
      panel.setStep(2);
      const control = selectedControl();
      highlight(control && control.element, 2, '在这个真实输入框填写 IMEI');
    },
    onPreview(selection) {
      try {
        readPage();
        const control = imei.findControl(controls, selection.port, selection.slot);
        const plan = imei.createChangePlan(imei.getMode(pageDocument), control, selection.value);
        plan.formSnapshot = snapshotControls();
        panel.setPreview(plan);
        panel.setStep(3);
        highlight(realSubmitButton(), 3, '核对预览后点击真实 Submit');
      } catch (error) {
        panel.setResult('failure', error.message);
      }
    },
    onBatchPrepare(selection) {
      let preparationSnapshot = null;
      try {
        if (imei.getMode(pageDocument) !== 0) throw new Error('当前不是可编辑模式，请先查看第 1 步。');
        const prefix = imei.normalizeBatchPrefix(selection.prefix);
        readPage();
        const batchControls = imei.selectBatchControls(
          controls,
          selection.startPort,
          selection.endPort,
          selection.slotCount
        );
        const operationControls = selection.scope === 'all'
          ? batchControls
          : batchControls.filter((control) => control.value === '');
        const seed = operationControls[0];
        if (!seed) {
          throw new Error(selection.scope === 'all'
            ? '所选范围没有可编辑的 IMEI 输入框。'
            : '所选范围没有空白槽位，未准备批量修改。');
        }
        const copyButton = realButton('Copy');
        const autoButton = realButton('AutoComplete');
        const clearButton = realButton('Clear');
        if (!copyButton || !autoButton || !clearButton) throw new Error('找不到真实 Copy、Clear 或 Auto Complete 按钮，未准备批量修改。');

        const before = controls.map((control) => ({ ...control }));
        const beforeSnapshot = snapshotControls();
        preparationSnapshot = beforeSnapshot;
        const enabledElements = new Set(operationControls.map((control) => control.element));
        const tableInputs = Array.from(pageDocument.querySelectorAll('#ID_TabImeiList input'));
        const disabledSnapshot = tableInputs.map((element) => ({ element, disabled: element.disabled }));
        try {
          tableInputs.forEach((element) => { element.disabled = !enabledElements.has(element); });
          if (selection.scope === 'all') {
            highlight(clearButton, 3, '清空所选范围', false);
            clearButton.click();
          }
          seed.element.value = prefix;
          dispatchInput(seed);
          panel.setStep(3);
          highlight(copyButton, 3, '复制到所选范围', false);
          copyButton.click();
          panel.setStep(4);
          highlight(autoButton, 4, '自动补全所选范围', false);
          autoButton.click();
        } finally {
          disabledSnapshot.forEach(({ element, disabled }) => { element.disabled = disabled; });
        }

        controls = imei.collectImeiControls(pageDocument);
        const changes = imei.buildBatchChanges(before, controls);
        if (!changes.length) throw new Error('真实按钮没有产生任何变更，请检查页面状态。');
        const operationNames = new Set(operationControls.map((control) => control.name));
        if (changes.some((change) => !operationNames.has(change.inputName))) {
          throw new Error('检测到处理方式目标之外的输入变化，已停止批量预览。');
        }
        changes.forEach((change) => imei.normalizeImei(change.finalValue));
        const plan = {
          kind: 'batch',
          prefix,
          scope: selection.scope,
          startPort: selection.startPort,
          endPort: selection.endPort,
          slotCount: selection.slotCount,
          targetCount: operationControls.length,
          beforeSnapshot,
          afterSnapshot: snapshotControls(),
          changes
        };
        panel.setBatchPreview(plan);
        panel.setStep(5);
        highlight(realSubmitButton(), 5, '核对全部变更后点击真实 Submit');
      } catch (error) {
        let recovery = '';
        if (preparationSnapshot) {
          try {
            controls = imei.collectImeiControls(pageDocument);
            restoreInputSnapshot(preparationSnapshot);
            readPage();
            panel.setWorkflow('batch');
            panel.setStep(2);
            recovery = ' 已恢复本次准备前的页面输入快照。';
          } catch (restoreError) {
            recovery = ` 快照恢复未完成：${restoreError.message}。请人工核对或刷新真实页面。`;
          }
        }
        panel.setResult('failure', `${error.message}${recovery} 本次没有点击 Submit。`);
      }
    },
    onBatchCancel(plan) {
      try {
        controls = imei.collectImeiControls(pageDocument);
        assertSnapshotMatches(plan.afterSnapshot, '预览后页面输入又发生变化，不能安全自动恢复。请人工核对或刷新真实页面。');
        restoreInputSnapshot(plan.beforeSnapshot);
        readPage();
        panel.setWorkflow('batch');
        panel.setStep(2);
        panel.setResult('info', '已恢复批量准备前的页面输入快照；本次没有点击 Submit，设备配置未提交。');
        const seed = firstEditableControl();
        highlight(seed && seed.element, 2, '已恢复快照，可重新填写前 8 位', false);
      } catch (error) {
        panel.setResult('unconfirmed', error.message);
      }
    },
    async onExecute(plan) {
      if (submitting) return;
      try {
        controls = imei.collectImeiControls(pageDocument);
        let changes;
        if (plan.kind === 'batch') {
          assertSnapshotMatches(plan.afterSnapshot, '预览后页面输入已变化，已停止 Submit。请重新生成批量预览。');
          changes = plan.changes;
        } else {
          assertSnapshotMatches(plan.formSnapshot, '预览后有输入框发生变化，已停止执行。请重新预览。');
          const control = imei.findControl(controls, plan.port, plan.slot);
          const freshPlan = imei.createChangePlan(imei.getMode(pageDocument), control, plan.enteredValue);
          if (freshPlan.finalValue !== plan.finalValue) throw new Error('页面状态已变化，请重新预览。');
          control.element.value = plan.enteredValue;
          dispatchInput(control);
          changes = [{
            inputName: plan.inputName,
            port: plan.port,
            slot: plan.slot,
            slotLabel: plan.slotLabel,
            previousValue: plan.previousValue,
            finalValue: plan.finalValue
          }];
        }
        await submitRealChanges(plan.kind, changes);
      } catch (error) {
        if (plan.kind === 'single' && !plan.attempted) {
          const control = imei.findControl(controls, plan.port, plan.slot);
          if (control && (control.value === plan.enteredValue || control.value === plan.finalValue)) {
            control.element.value = plan.previousValue;
            dispatchInput(control);
          }
        }
        submitting = false;
        panel.setBusy(false);
        panel.setResult('failure', error.message);
      }
    },
    async onProfileChange(value) {
      const previous = profilePreference;
      const sequence = ++profileChangeSequence;
      profilePreference = deviceProfile.normalizePreference(value);
      if (profilePreference === 'auto') {
        softwareVersion = '';
        softwareDetectionState = 'idle';
        profileDetectionStartedAt = Date.now();
      }
      syncProfile();
      try {
        await profileStorage('set', profilePreference);
      } catch (error) {
        if (sequence !== profileChangeSequence) return;
        profilePreference = previous;
        syncProfile();
        panel.setResult('failure', `设备类型偏好保存失败：${error.message}。本次已恢复原选择。`);
      }
    },
    onModuleOpen: openModule,
    onBackModules() {
      if (!canLeaveCurrentPage()) return;
      clearHighlight();
      panel.showModules(activeModule && activeModule.id, activeModule);
      panel.setResult('info', '已返回功能列表，右侧真实页面保持不变。');
    },
    onRebootGuide: locateReboot
  });

  syncProfile();
  panel.setShell(isMainPage);
  panel.toggle(isMainPage);

  async function submitRealChanges(kind, changes) {
    const submitButton = realSubmitButton();
    if (!submitButton) throw new Error('找不到设备原有的 Submit 按钮，未执行修改。');
    const submittedDocument = pageDocument;
    const pending = {
      version: 2,
      kind,
      origin: pageWindow.location.origin,
      path: pageWindow.location.pathname,
      changes,
      verificationAttempts: 0,
      createdAt: Date.now()
    };
    await pendingStorage('set', pending);
    if (pageDocument !== submittedDocument || !submitButton.isConnected) {
      await pendingStorage('remove');
      throw new Error('等待写入回读记录时真实页面已变化，未点击 Submit。请重新识别页面并预览。');
    }
    submitting = true;
    panel.setBusy(true);
    panel.markAttempted();
    panel.setStep(kind === 'batch' ? 5 : 3);
    panel.setResult('info', `已准备 ${changes.length} 项变更，正在点击真实 Submit。结果必须等待页面回读。`);
    highlight(submitButton, kind === 'batch' ? 5 : 3, '已调用真实 Submit，等待设备返回', false);
    submitButton.click();
    setTimeout(() => {
      if (!submitting || pageDocument !== submittedDocument) return;
      submitting = false;
      panel.setBusy(false);
      panel.setResult('unconfirmed', '已调用真实 Submit，但页面尚未完成返回。设备可能有延迟或校验提示；当前不能确认保存成功。');
    }, 7000);
  }

  async function verifyPendingOperation(targetDocument) {
    let pending = await pendingStorage('get');
    if (targetDocument !== pageDocument) return;
    if (!pending || !pageWindow || pending.origin !== pageWindow.location.origin || pending.path !== pageWindow.location.pathname) return;
    if (Date.now() - pending.createdAt > 15 * 60 * 1000) {
      await pendingStorage('remove');
      submitting = false;
      panel.setBusy(false);
      panel.setResult('unconfirmed', '一次待回读操作已超过 15 分钟，停止自动重试。请人工检查真实页面。');
      return;
    }
    if (pending.version === 1) {
      pending = {
        version: 2,
        kind: 'single',
        origin: pending.origin,
        path: pending.path,
        changes: [{
          inputName: pending.inputName,
          port: pending.port,
          slot: pending.slot,
          slotLabel: pending.slotLabel,
          previousValue: pending.previousValue,
          finalValue: pending.finalValue
        }],
        verificationAttempts: 0,
        createdAt: pending.createdAt
      };
    }
    if (!Array.isArray(pending.changes) || !pending.changes.length) return;

    controls = imei.collectImeiControls(pageDocument);
    const result = imei.evaluateBatchReadback(pending, controls);
    panel.setPage(imei.getMode(pageDocument), controls);
    panel.setWorkflow(pending.kind === 'batch' ? 'batch' : 'single');
    if (pending.kind !== 'batch') panel.selectTarget(pending.changes[0].port, pending.changes[0].slot);
    panel.setStep(pending.kind === 'batch' ? 5 : 3);
    submitting = false;
    panel.setBusy(false);

    if (result.status === 'success') {
      panel.clearPreview();
      panel.setResult('success', result.message);
      await pendingStorage('remove');
    } else if (pending.verificationAttempts < 2) {
      pending.verificationAttempts += 1;
      await pendingStorage('set', pending);
      const delay = pending.verificationAttempts * 2500;
      panel.setResult('unconfirmed', `${result.message} 将在 ${delay / 1000} 秒后刷新真实功能页重读（第 ${pending.verificationAttempts}/2 次重试）。`);
      const sequence = ++verificationSequence;
      verificationTimer = setTimeout(() => {
        if (sequence !== verificationSequence || pageDocument !== targetDocument || !pageWindow) return;
        pageWindow.location.reload();
      }, delay);
    } else {
      panel.clearPreview();
      panel.setResult(result.status, `${result.message} 已完成 2 次自动重读，请人工核对设备状态。`);
      await pendingStorage('remove');
    }
    const first = controls.find((control) => control.name === pending.changes[0].inputName);
    highlight(first && first.element, pending.kind === 'batch' ? 5 : 3, '提交后的真实回读位置', false);
  }

  function attachPage(targetDocument, targetWindow) {
    clearHighlight();
    if (verificationTimer) clearTimeout(verificationTimer);
    verificationSequence += 1;
    pageDocument = targetDocument;
    pageWindow = targetWindow;
    activeModule = moduleRegistry.getModule('imei');
    submitting = false;
    etmsSubmitting = false;
    panel.setBusy(false);
    installAssistantStyles(pageDocument);
    readPage();
    panel.toggle(true);
    highlight(modeRadio(), 1, '确认“指定 IMEI 前缀”模式', false);
    verifyPendingOperation(targetDocument).catch((error) => {
      submitting = false;
      panel.setBusy(false);
      panel.setResult('unconfirmed', `真实页面已返回，但待回读记录处理失败：${error.message}。请人工核对当前值。`);
    });
  }

  function attachEtmsPage(targetDocument, targetWindow) {
    clearHighlight();
    if (etmsVerificationTimer) clearTimeout(etmsVerificationTimer);
    etmsVerificationSequence += 1;
    pageDocument = targetDocument;
    pageWindow = targetWindow;
    controls = [];
    activeModule = moduleRegistry.getModule('etms-registration');
    submitting = false;
    etmsSubmitting = false;
    panel.setBusy(false);
    installAssistantStyles(pageDocument);
    readEtmsPage();
    panel.toggle(true);
    highlightEtmsStep(1, false);
    verifyEtmsPending(targetDocument).catch((error) => {
      etmsSubmitting = false;
      panel.setBusy(false);
      panel.setResult('unconfirmed', `真实页面已返回，但 ETMS 回读记录处理失败：${error.message}。请人工核对当前状态。`);
    });
  }

  function detachPage() {
    const discardedPreview = Boolean((panel.plan && !panel.plan.attempted) || (panel.etmsPlan && !panel.etmsPlan.attempted));
    clearHighlight();
    if (verificationTimer) clearTimeout(verificationTimer);
    if (etmsVerificationTimer) clearTimeout(etmsVerificationTimer);
    verificationSequence += 1;
    etmsVerificationSequence += 1;
    pageDocument = null;
    pageWindow = null;
    controls = [];
    submitting = false;
    etmsSubmitting = false;
    panel.setBusy(false);
    panel.clearEtmsPreview();
    panel.clearPreview();
    if (isMainPage) {
      panel.showModules(activeModule && activeModule.id, activeModule);
      panel.toggle(true);
      if (discardedPreview) {
        panel.setResult('unconfirmed', '真实功能页已切换，未提交预览已关闭；本次没有点击 Submit。');
      }
    } else {
      panel.toggle(false);
    }
  }

  function syncPage() {
    syncProfile();
    if (isDirectImeiPage) {
      if (pageDocument !== document && imei.isSupportedPage(location, document) && imei.collectImeiControls(document).length) {
        attachPage(document, window);
      }
      return;
    }
    const rightFrame = findFrame('right');
    if (!rightFrame) return;
    try {
      const targetWindow = rightFrame.contentWindow;
      const targetDocument = rightFrame.contentDocument;
      const isImei = imei.isSupportedPage(targetWindow.location, targetDocument) && imei.collectImeiControls(targetDocument).length;
      const isEtms = !isImei && etms.isSupportedPage(targetWindow.location, targetDocument);
      const nextModuleId = isImei ? 'imei' : (isEtms ? 'etms-registration' : null);
      if (nextModuleId) {
        if (pageDocument !== targetDocument) {
          if (pageDocument && activeModule && activeModule.id !== nextModuleId) detachPage();
          if (isImei) attachPage(targetDocument, targetWindow);
          else attachEtmsPage(targetDocument, targetWindow);
        } else if (isEtms) {
          refreshEtmsStatus();
        }
      } else {
        activeModule = moduleRegistry.matchLocation(targetWindow.location);
        if (pageDocument) detachPage();
        else {
          panel.showModules(activeModule && activeModule.id, activeModule);
          panel.toggle(true);
        }
      }
    } catch (_) {
      if (pageDocument) detachPage();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'skyline.toggle-panel') {
      if (pageDocument) panel.toggle();
      sendResponse({ ok: Boolean(pageDocument) });
    }
  });

  syncPage();
  if (isMainPage) {
    loadProfilePreference();
    setInterval(syncPage, 500);
  }
})();
