(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkylineEtms = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ETMS_TYPE = 2;

  function findBox(doc) {
    return doc && doc.querySelector('#EjoinRemMgmtBox');
  }

  // Firmware variants: some builds give the inputs only a name (no id), so match both.
  function findField(box, id, name) {
    return box.querySelector(`#${id}`) || box.querySelector(`input[name="${name}"]`);
  }

  function readCurrent(doc) {
    const box = findBox(doc);
    if (!box) return null;
    const form = box.querySelector('form');
    const radios = Array.from(box.querySelectorAll('input[name="ermc_enable"]'));
    const checked = radios.find((radio) => radio.checked) || null;
    const server = findField(box, 'ID_erms_ip', 'erms_ip');
    const port = findField(box, 'ID_erms_port', 'erms_port');
    const account = findField(box, 'ID_ermc_username', 'ermc_username');
    const password = findField(box, 'ID_ermc_password', 'ermc_password');
    const status = box.querySelector('#ID_TdErmStatus');
    const submit = form && form.querySelector('.infoBoxBodyBtns input[type="submit"]');
    if (!form || radios.length < 3 || !server || !port || !account || !password || !status || !submit) return null;
    const controls = [checked, server, port, account, password].filter(Boolean);
    return {
      type: checked ? Number(checked.value) : null,
      server: server.value.trim(),
      port: port.value.trim(),
      account: account.value.trim(),
      status: status.textContent.trim(),
      disabled: controls.some((control) => Boolean(control.disabled)),
      elements: { form, radios, checked, server, port, account, password, status, submit }
    };
  }

  function normalizeServerHost(value) {
    const server = String(value || '').trim();
    if (!server) throw new Error('请输入 ETMS 服务器 IP 地址或域名。');
    if (server.length > 64) throw new Error('ETMS 服务器地址不能超过 64 个字符。');
    if (/\s/.test(server)) throw new Error('ETMS 服务器地址不能包含空白字符。');
    return server;
  }

  function normalizePort(value) {
    const text = String(value || '').trim();
    if (!/^\d+$/.test(text)) throw new Error('ETMS 网管端口必须是数字。');
    const port = Number(text);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ETMS 网管端口必须在 1 到 65535 之间。');
    return port;
  }

  function normalizeAccount(value) {
    const account = String(value || '').trim();
    if (!account) throw new Error('请输入 ETMS 账号。');
    if (account.length > 64) throw new Error('ETMS 账号不能超过 64 个字符。');
    if (/\s/.test(account)) throw new Error('ETMS 账号不能包含空白字符。');
    return account;
  }

  function normalizePassword(value) {
    const password = String(value || '');
    if (!password) throw new Error('请输入 ETMS 账号密码；助手不会读取或保存页面现有密码。');
    if (password.length > 128) throw new Error('ETMS 账号密码不能超过 128 个字符。');
    return password;
  }

  function snapshot(current) {
    if (!current) return null;
    return {
      type: current.type === null ? null : Number(current.type),
      server: current.server,
      port: String(current.port),
      account: current.account,
      disabled: Boolean(current.disabled)
    };
  }

  function snapshotsEqual(a, b) {
    return Boolean(a && b)
      && a.type === b.type
      && a.server === b.server
      && a.port === b.port
      && a.account === b.account
      && a.disabled === b.disabled;
  }

  function createChangePlan(current, input) {
    if (!current) throw new Error('当前页面不是可识别的 ETMS 设备网管页面。');
    if (current.disabled) throw new Error('ETMS 设备网管控件当前被页面禁用，不能代为修改。');
    const server = normalizeServerHost(input && input.server);
    const port = normalizePort(input && input.port);
    const account = normalizeAccount(input && input.account);
    const password = normalizePassword(input && input.password);
    const changed = current.type !== ETMS_TYPE
      || current.server !== server
      || String(current.port) !== String(port)
      || current.account !== account;
    return {
      kind: 'etms',
      type: ETMS_TYPE,
      server,
      port,
      account,
      password,
      changed,
      previous: {
        type: current.type,
        server: current.server,
        port: String(current.port),
        account: current.account,
        status: current.status
      },
      snapshot: snapshot(current)
    };
  }

  function evaluateRegistrationReadback(pending, current) {
    if (!pending || pending.kind !== 'etms') {
      return { status: 'unconfirmed', message: '没有可核对的 ETMS 注册记录。' };
    }
    if (!current) {
      return { status: 'unconfirmed', message: '提交后未在真实页面找到 ETMS 设备网管表单，无法确认结果。' };
    }
    const expected = pending.expected || {};
    const mismatches = [];
    if (Number(current.type) !== ETMS_TYPE) mismatches.push('网管类型不是 ETMS');
    if (current.server !== expected.server) mismatches.push(`服务器预期 ${expected.server}，当前 ${current.server || '（空）'}`);
    if (String(current.port) !== String(expected.port)) mismatches.push(`端口预期 ${expected.port}，当前 ${current.port || '（空）'}`);
    if (current.account !== expected.account) mismatches.push(`账号预期 ${expected.account}，当前 ${current.account || '（空）'}`);
    if (mismatches.length) {
      return {
        status: 'failure',
        message: `ETMS 回读不一致：${mismatches.join('；')}。密码不由助手回读。`
      };
    }
    if (/^OK\b/i.test(current.status || '')) {
      return {
        status: 'success',
        message: `ETMS 注册状态已回读为 OK：${current.server}:${current.port} / ${current.account}。密码未保存，也未由助手回读。`
      };
    }
    return {
      status: 'unconfirmed',
      message: `ETMS 设置已提交，但状态尚未显示 OK（当前：${current.status || '空'}）。将继续等待设备自身状态刷新。`
    };
  }

  function isSupportedPage(locationLike, doc) {
    return /^\/user_management_(?:en|cn)\.html$/.test(locationLike && locationLike.pathname)
      && Boolean(readCurrent(doc));
  }

  return {
    ETMS_TYPE,
    createChangePlan,
    evaluateRegistrationReadback,
    isSupportedPage,
    normalizeAccount,
    normalizePassword,
    normalizePort,
    normalizeServerHost,
    readCurrent,
    snapshot,
    snapshotsEqual
  };
});
