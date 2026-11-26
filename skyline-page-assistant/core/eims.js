(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkylineEims = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 真实页面“基本设置”区块（#ESN_Box）中服务器类型下拉的 EIMS 选项值。
  const EIMS_TYPE = 1;
  const PROTOCOL_LABELS = { 0: 'UDP', 1: 'TCP' };

  function findBox(doc) {
    return doc && doc.querySelector('#ESN_Box');
  }

  // Firmware variants: some builds give the inputs only a name (no id), so match both.
  function findField(box, id, name) {
    return box.querySelector(`#${id}`) || box.querySelector(`[name="${name}"]`);
  }

  function readCurrent(doc) {
    const box = findBox(doc);
    if (!box) return null;
    // 真实页面结构是 <form><div id="ESN_Box">…，表单包裹区块。
    const form = box.closest('form') || box.querySelector('form');
    const typeSelect = findField(box, 'ID_esn_server_type', 'esn_server_type');
    const server = findField(box, 'ID_esn_server', 'esn_server');
    // 较新固件只支持 TCP，整个 UDP/TCP 行（#esn_ucp_tcp_tr_id）会从页面消失，按可选处理。
    const protocol = findField(box, 'ID_esn_ucp_tcp', 'esn_ucp_tcp');
    const username = findField(box, 'ID_esn_username', 'esn_username');
    const password = findField(box, 'ID_esn_password', 'esn_password');
    const status = box.querySelector('#ID_TdEsnStatus');
    const submit = form && form.querySelector('.infoBoxBodyBtns input[type="submit"]');
    if (!form || !typeSelect || !server || !username || !password || !status || !submit) return null;
    const type = Number(typeSelect.value);
    const controls = [typeSelect, server, protocol, username, password].filter(Boolean);
    return {
      type: Number.isInteger(type) ? type : null,
      server: server.value.trim(),
      protocol: protocol ? String(protocol.value) : null,
      username: username.value.trim(),
      status: status.textContent.trim(),
      // 只记录密码框是否非空，绝不读取、保存或传输密码内容。
      passwordFilled: Boolean(password.value),
      disabled: controls.some((control) => Boolean(control.disabled)),
      elements: { form, typeSelect, server, protocol, username, password, status, submit }
    };
  }

  // 服务器地址允许“IP/域名”或“IP/域名:端口”（页面提示：如要指定端口，请加端口）。
  function normalizeServerAddress(value) {
    const server = String(value || '').trim();
    if (!server) throw new Error('请输入 EIMS 服务器地址。');
    if (server.length > 64) throw new Error('EIMS 服务器地址不能超过 64 个字符。');
    if (/\s/.test(server)) throw new Error('EIMS 服务器地址不能包含空白字符。');
    const parts = server.split(':');
    if (parts.length > 2 || !parts[0]) throw new Error('EIMS 服务器地址格式应为 IP/域名，可用“:端口”指定端口。');
    if (parts.length === 2) {
      if (!/^\d+$/.test(parts[1])) throw new Error('EIMS 服务器地址中的端口必须是数字。');
      const port = Number(parts[1]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('EIMS 服务器地址中的端口必须在 1 到 65535 之间。');
    }
    return server;
  }

  function normalizeUsername(value) {
    const username = String(value || '').trim();
    if (!username) throw new Error('请输入 EIMS 用户名。');
    if (username.length > 64) throw new Error('EIMS 用户名不能超过 64 个字符。');
    if (/\s/.test(username)) throw new Error('EIMS 用户名不能包含空白字符。');
    return username;
  }

  function normalizeProtocol(value) {
    if (value === null || value === undefined) return null;
    const protocol = String(value);
    if (!Object.hasOwn(PROTOCOL_LABELS, protocol)) throw new Error('无法识别真实表单的 UDP/TCP 选择，请人工核对。');
    return protocol;
  }

  function snapshot(current) {
    if (!current) return null;
    return {
      type: current.type === null ? null : Number(current.type),
      server: current.server,
      protocol: current.protocol === null || current.protocol === undefined ? null : String(current.protocol),
      username: current.username,
      passwordFilled: Boolean(current.passwordFilled),
      disabled: Boolean(current.disabled)
    };
  }

  function snapshotsEqual(a, b) {
    return Boolean(a && b)
      && a.type === b.type
      && a.server === b.server
      && a.protocol === b.protocol
      && a.username === b.username
      && a.passwordFilled === b.passwordFilled
      && a.disabled === b.disabled;
  }

  // 用户在真实表单中直接填写；这里只校验真实表单当前值并生成提交计划，
  // 计划不包含、也不需要包含密码。
  function createChangePlan(current) {
    if (!current) throw new Error('当前页面不是可识别的 EIMS 注册页面。');
    if (current.disabled) throw new Error('EIMS 注册控件当前被页面禁用，不能代为提交。');
    if (current.type !== EIMS_TYPE) throw new Error('请先在真实表单把服务器类型选为 EIMS，再生成预览。');
    const server = normalizeServerAddress(current.server);
    const username = normalizeUsername(current.username);
    const protocol = normalizeProtocol(current.protocol);
    if (!current.passwordFilled) throw new Error('请先在真实表单中填写 EIMS 密码；助手不读取密码内容。');
    return {
      kind: 'eims',
      type: EIMS_TYPE,
      server,
      protocol,
      username,
      snapshot: snapshot(current)
    };
  }

  function evaluateRegistrationReadback(pending, current) {
    if (!pending || pending.kind !== 'eims') {
      return { status: 'unconfirmed', message: '没有可核对的 EIMS 注册记录。' };
    }
    if (!current) {
      return { status: 'unconfirmed', message: '提交后未在真实页面找到 EIMS 注册表单，无法确认结果。' };
    }
    const expected = pending.expected || {};
    const mismatches = [];
    if (Number(current.type) !== EIMS_TYPE) mismatches.push('服务器类型不是 EIMS');
    if (current.server !== expected.server) mismatches.push(`服务器预期 ${expected.server}，当前 ${current.server || '（空）'}`);
    if (expected.protocol !== null && expected.protocol !== undefined
      && current.protocol !== null && String(current.protocol) !== String(expected.protocol)) {
      mismatches.push(`UDP/TCP 预期 ${PROTOCOL_LABELS[expected.protocol] || expected.protocol}，当前 ${PROTOCOL_LABELS[current.protocol] || current.protocol || '（空）'}`);
    }
    if (current.username !== expected.username) mismatches.push(`用户名预期 ${expected.username}，当前 ${current.username || '（空）'}`);
    if (mismatches.length) {
      return {
        status: 'failure',
        message: `EIMS 回读不一致：${mismatches.join('；')}。密码不由助手回读。`
      };
    }
    const status = (current.status || '').trim();
    if (!status) {
      return {
        status: 'awaiting-reboot',
        message: '表单已提交保存。EIMS 注册状态必须保存并重启设备后才会显示。'
      };
    }
    if (/\bOK\b/i.test(status)) {
      return {
        status: 'success',
        message: `EIMS 注册状态已回读为 OK：${current.server} / ${current.username}。密码未保存，也未由助手回读。`
      };
    }
    return {
      status: 'unconfirmed',
      message: `EIMS 设置已提交，注册状态暂为“${status}”，未确认成功。`
    };
  }

  // 注册表单实测位于 eims_settings_en.html；部分固件把它与 app_esn 页面合并，
  // 因此路径放开到两者，真正的识别靠 #ESN_Box 表单指纹。
  function isSupportedPage(locationLike, doc) {
    return /^\/(?:eims_settings|app_esn)_(?:en|cn)\.html$/.test(locationLike && locationLike.pathname)
      && Boolean(readCurrent(doc));
  }

  return {
    EIMS_TYPE,
    PROTOCOL_LABELS,
    createChangePlan,
    evaluateRegistrationReadback,
    isSupportedPage,
    normalizeProtocol,
    normalizeServerAddress,
    normalizeUsername,
    readCurrent,
    snapshot,
    snapshotsEqual
  };
});
