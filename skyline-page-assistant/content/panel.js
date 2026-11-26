(function (root) {
  'use strict';

  /* 界面偏好：固定扇形项 + 语言，走 background 固定键代理，只存这两项。 */
  const UI_PREFS_KEY = 'skyline.ui.preferences';
  const DEFAULT_PINNED = ['imei', 'etms-registration', 'eims-settings', 'save-reboot'];
  const FAN_MAX = 4;
  const FAN_RADIUS = 138;

  /* 视图层展示元数据：模块在设备真实菜单里的位置、扇形短标签和一句话说明。
     只影响显示，不参与导航、识别或可用性判断（那些仍由 core/modules.js、
     controller 与真实菜单决定）。分组按设备真实菜单位置（甲方案）：
     移动设置 / 短信设置 / 语音设置 / 系统设置。 */
  const MODULE_META = {
    imei: {
      group: 'mobile',
      label: { zh: 'IMEI', en: 'IMEI' },
      name: { zh: 'IMEI 修改', en: 'IMEI Change' },
      path: { zh: '移动设置 → Mobile Setting', en: 'Mobile Setting' },
      desc: { zh: '单个/批量修改端口 IMEI，预览后确认提交。', en: 'Change port IMEIs one by one or in batch, with preview.' }
    },
    'eims-settings': {
      group: 'sms',
      label: { zh: 'EIMS', en: 'EIMS' },
      name: { zh: 'EIMS 注册', en: 'EIMS Registration' },
      path: { zh: '短信设置 → EIMS 设置', en: 'SMS Settings → EIMS Settings' },
      desc: { zh: 'EIMS 注册：提交后须保存重启才显示状态。', en: 'EIMS registration: status appears only after save & reboot.' }
    },
    'sms-control': {
      group: 'sms',
      label: { zh: 'SMS', en: 'SMS' },
      name: { zh: 'SMS 控制', en: 'SMS Control' },
      path: { zh: '短信设置 → SMS 控制', en: 'SMS Settings → SMS Control' },
      desc: { zh: '短信开关与参数，打开真实页面操作。', en: 'SMS switches and parameters on the real page.' }
    },
    'call-duration': {
      group: 'voice',
      label: { zh: '时长', en: 'Time' },
      name: { zh: '通话时长限制', en: 'Call Duration Limit' },
      path: { zh: '语音设置 → Call Duration Limit', en: 'Voice Settings → Call Duration Limit' },
      desc: { zh: '按时长限制呼叫。', en: 'Limit calls by duration.' }
    },
    'call-count': {
      group: 'voice',
      label: { zh: '次数', en: 'Count' },
      name: { zh: '呼叫次数控制', en: 'Call Num Control' },
      path: { zh: '语音设置 → Call Num Control', en: 'Voice Settings → Call Num Control' },
      desc: { zh: '按次数限制呼叫。', en: 'Limit calls by count.' }
    },
    'talk-numbers': {
      group: 'voice',
      label: { zh: '号码', en: 'Number' },
      name: { zh: '通话号码控制', en: 'Talk Number Settings' },
      path: { zh: '语音设置 → Talk Number Settings', en: 'Voice Settings → Talk Number Settings' },
      desc: { zh: '号码名单。', en: 'Number lists.' }
    },
    'call-control': {
      group: 'voice',
      label: { zh: '呼叫', en: 'Call' },
      name: { zh: '呼叫控制设置', en: 'Call Ctrl Settings' },
      path: { zh: '语音设置 → Call Ctrl Settings', en: 'Voice Settings → Call Ctrl Settings' },
      desc: { zh: '呼叫行为控制。', en: 'Call behavior control.' }
    },
    'etms-registration': {
      group: 'sys',
      label: { zh: 'ETMS', en: 'ETMS' },
      name: { zh: 'ETMS 注册', en: 'ETMS Registration' },
      path: { zh: '系统设置 → User & Device', en: 'System Settings → User & Device' },
      desc: { zh: '设备网管注册：真实表单直填，状态 OK 回读。', en: 'EMS registration via the real form, status read back as OK.' }
    },
    'save-reboot': {
      group: 'sys',
      label: { zh: '重启', en: 'Reboot' },
      name: { zh: '保存 / 重启', en: 'Save / Reboot' },
      path: { zh: '系统设置 → Save and Reboot', en: 'System Settings → Save and Reboot' },
      desc: { zh: '只展开并定位真实菜单，绝不自动执行。', en: 'Expand and locate the real menu only, never auto-run.' }
    }
  };
  const GROUP_ORDER = ['mobile', 'sms', 'voice', 'sys', 'other'];

  /* 面板自有文案的双语字典。controller 产生的消息（结果、回读）保持中文原文，
     这里只翻译面板自己拥有的静态与动态展示文本。 */
  const I18N = {
    zh: {
      viewHome: '功能导航',
      guideSuffix: '指导',
      subtitleHome: '全局助手 · 顶层页面模式',
      subtitleImeiMain: 'IMEI 设置 · 顶层页面模式',
      subtitleImeiFrame: 'IMEI 设置 · 功能页模式',
      subtitleEtmsMain: 'ETMS 注册 · 顶层页面模式',
      subtitleEtmsFrame: 'ETMS 注册 · 功能页模式',
      subtitleEimsMain: 'EIMS 注册 · 顶层页面模式',
      subtitleEimsFrame: 'EIMS 注册 · 功能页模式',
      fabAria: '打开助手功能扇形',
      fabClose: '收起',
      minimizeTitle: '收起为圆形',
      hideTitle: '关闭（点击扩展图标可重新打开）',
      liveHome: '已连接设备主页面',
      liveImei: '已连接真实页面',
      liveEtms: '已连接 ETMS 页面',
      liveEims: '已连接 EIMS 页面',
      selectModule: '请选择功能',
      navOnlySuffix: ' · 仅导航',
      typeLabel: '设备类型',
      optAuto: '自动',
      optSms: '短信',
      optVoice: '语音',
      profileSms: '短信设备',
      profileVoice: '语音设备',
      profileUnknown: '未识别',
      profileAuto: (label, suffix) => `自动：${label}${suffix}`,
      profileManual: (label) => `手动：${label}`,
      profileSuffix: (detail) => `（${detail}）`,
      profileDetecting: '自动：识别中',
      searchPh: '搜索功能…',
      noMatch: '没有匹配的功能',
      homeNote: '仅 IMEI / ETMS / EIMS 在确认后代操作；行尾 ＋ 把功能固定到扇形。',
      tagAct: '代操作',
      tagNav: '仅导航',
      tagLoc: '仅定位',
      groupMobile: '移动设置',
      groupSms: '短信设置',
      groupVoice: '语音设置',
      groupSys: '系统设置',
      groupOther: '其他',
      moreLabel: '更多',
      moreName: '全部功能',
      moreDesc: '打开完整功能表：可搜索，行尾 ＋ 可固定到扇形。',
      moreCap: '功能表',
      addTitle: '添加到扇形',
      removeTitle: '从扇形移除',
      fanFull: '扇形最多 4 项：先在功能表移除一个，再添加。',
      backModules: '← 功能列表',
      reading: '正在读取…',
      wfSingle: '单个修改',
      wfBatch: '批量修改',
      workflows: {
        single: [
          ['确认模式', '需为“指定 IMEI 前缀”；切换模式会提交。'],
          ['选择并填写', '选择端口和槽位，输入 14 或 15 位 IMEI。'],
          ['提交并回读', '核对原值和新值，再确认真实 Submit。'],
          ['保存并重启', '仅定位真实菜单，不自动执行。']
        ],
        batch: [
          ['确认模式', '需为“指定 IMEI 前缀”。'],
          ['选择范围', '选择端口和数量，输入 8 位前缀。'],
          ['复制', '调用真实 Copy，仅处理所选范围。'],
          ['自动补全', '调用真实 Auto Complete，生成完整 IMEI。'],
          ['提交并回读', '核对变更后确认真实 Submit。'],
          ['保存并重启', '仅定位真实菜单，不自动执行。']
        ]
      },
      stepTabs: { single: ['模式', '填写', '提交', '重启'], batch: ['模式', '范围', 'Copy', '补全', '提交', '重启'] },
      etmsSteps: [
        ['确认 ETMS 区块', '只在“用户及设备管理”的设备网管区块操作。'],
        ['选择 ETMS', '在真实表单把网管类型选为 ETMS；NONE/ERMS 不是本流程。'],
        ['填写注册信息', '直接在右侧真实表单填写服务器、端口、账号和密码。'],
        ['预览并提交', '核对真实表单的非密码字段后，再确认真实 Submit。'],
        ['回读状态', '等待真实状态变为 OK；不打开外部注册链接。']
      ],
      etmsTabLabels: ['区块', '类型', '填写', '提交', '状态'],
      eimsSteps: [
        ['确认 EIMS 区块', '只在“基本设置”的 EIMS 注册区块操作。'],
        ['选择 EIMS', '在真实表单把服务器类型选为 EIMS；NONE/EMDA 不是本流程。'],
        ['填写注册信息', '直接在右侧真实表单填写服务器地址、UDP/TCP（如有）、用户名和密码。'],
        ['预览并提交', '核对真实表单的非密码字段后，再确认真实 Submit。'],
        ['保存并重启', 'EIMS 注册状态必须保存并重启设备后才会显示；助手只定位真实菜单，不自动重启。'],
        ['回读注册状态', '设备重启完成并回到本页后，等待真实注册状态显示 OK。']
      ],
      eimsTabLabels: ['区块', '类型', '填写', '提交', '重启', '状态'],
      modeLabels: { 0: '指定 IMEI 前缀', 1: '自定义范围', 3: '从 ESPS 服务器获取', 4: '从 ETMS 服务器获取' },
      modeUnknown: (mode) => `未知模式 (${mode})`,
      stepCount: (step, total) => `第 ${step} 步，共 ${total} 步`,
      nextStep: '下一步 →',
      lastStep: '已到最后一步',
      locate: '定位本步',
      portLabel: '端口',
      slotLabel: '槽位',
      portOption: (port) => `端口 ${port}`,
      slotOption: (label) => `槽位 ${label}`,
      beforeLabel: '原值：',
      emptyValue: '（空）',
      notFound: '未找到',
      imeiFormTitle: '修改 IMEI',
      newImeiLabel: '新 IMEI（14/15 位）',
      imeiPh: '输入完整 IMEI',
      previewBtn: '预览',
      batchFormTitle: '批量生成',
      startPortLabel: '起始端口',
      endPortLabel: '结束端口',
      perPortLabel: '每端口',
      prefixLabel: 'IMEI 前 8 位',
      prefixPh: '8 位数字',
      scopeLabel: '处理方式',
      scopeEmpty: '仅填空白',
      scopeAll: '清空所选范围后重建',
      batchPrepare: '生成批量预览',
      targetEmpty: '请选择范围',
      targetIncomplete: '请选择完整范围',
      targetSummary: (s, e, n, t) => `端口 ${s}–${e} · 每端口 ${n} 个 · 共 ${t} 个`,
      previewTitle: '核对变更',
      pvTarget: '目标',
      pvBefore: '原值',
      pvAfter: '新值',
      targetLine: (port, slotLabel) => `端口 ${port} / 槽位 ${slotLabel}`,
      autoAppend: '设备将追加第 15 位。',
      autoSaved: '由真实 Submit 保存。',
      autoUnchanged: '值未变化。',
      submitWhole: ' Submit 会保存整张表。',
      batchCount: (s, e, t, c) => `端口 ${s}–${e} · 目标 ${t} 个 · 实际变更 ${c} 个`,
      batchAutoNote: '由真实按钮生成；Submit 会保存整张表。',
      execChange: '确认并修改',
      execUnchanged: '值未变化，仍提交',
      execBatch: (n) => `确认提交 ${n} 项变更`,
      execRetry: '再次尝试 Submit（上次结果未确认）',
      cancelPreview: '取消预览',
      cancelRestore: '取消并恢复',
      resultPreview: '预览尚未提交。',
      resultBatchPreview: '预览未保存，可取消恢复。',
      resultAttemptedImei: '真实 Submit 已经尝试过，取消预览不能撤销设备修改。请等待回读或人工核对真实页面。',
      resultAttemptedReg: '真实 Submit 已经尝试过，取消预览不能撤销设备修改。请等待状态回读或人工核对真实页面。',
      etmsFormTitle: 'ETMS 注册',
      etmsNotice: '请直接在右侧真实表单中选择 ETMS 类型，并填写服务器、端口、账号和密码；助手只读取非密码字段，密码只检查是否已填写。没有 ETMS 账号？请先在服务商处注册；助手不会打开外部注册链接。',
      readPreview: '读取真实表单并预览',
      etmsPreviewTitle: '核对 ETMS 注册',
      etmsAutoNote: '将按右侧真实表单的当前值提交；密码只确认已填写，不读取、不显示、不保存。',
      execEtms: '确认并提交 ETMS 注册',
      resultEtmsPreview: 'ETMS 预览尚未提交。',
      etmsNoForm: '当前：未读取到 ETMS 设备网管表单',
      currentEtms: (type, server, port, account, status) => `当前：${type} · ${server}:${port} · ${account} · 状态 ${status}`,
      eimsFormTitle: 'EIMS 注册',
      eimsNotice: '请直接在右侧真实表单中选择 EIMS 服务器类型，并填写服务器地址、UDP/TCP（如有）、用户名和密码；助手只读取非密码字段，密码只检查是否已填写。注册状态必须保存并重启设备后才会显示。',
      eimsPreviewTitle: '核对 EIMS 注册',
      eimsAutoNote: '将按右侧真实表单的当前值提交；密码只确认已填写，不读取、不显示、不保存。提交后必须保存并重启设备，注册状态才会显示。',
      execEims: '确认并提交 EIMS 注册',
      resultEimsPreview: 'EIMS 预览尚未提交。',
      eimsNoForm: '当前：未读取到 EIMS 注册表单',
      currentEims: (type, server, protocol, username, status) => `当前：${type} · ${server}${protocol ? ` · ${protocol}` : ''} · ${username} · 状态 ${status}`,
      regValue: (type, status) => `${type} · 状态 ${status}`,
      statusEmpty: '空',
      typeUnknown: (type) => `未知 (${type})`,
      typeUnrecognized: '未识别',
      pvType: '类型',
      pvServer: '服务器',
      pvPort: '端口',
      pvAccount: '账号',
      pvProtocol: 'UDP/TCP',
      pvUsername: '用户名',
      pvPassword: '密码',
      passwordFilled: '已填写（不读取、不显示）',
      privacy: '仅本机处理',
      rebootGuide: '保存 / 重启'
    },
    en: {
      viewHome: 'Modules',
      guideSuffix: ' Guide',
      subtitleHome: 'Global assistant · top page',
      subtitleImeiMain: 'IMEI settings · top page',
      subtitleImeiFrame: 'IMEI settings · frame page',
      subtitleEtmsMain: 'ETMS registration · top page',
      subtitleEtmsFrame: 'ETMS registration · frame page',
      subtitleEimsMain: 'EIMS registration · top page',
      subtitleEimsFrame: 'EIMS registration · frame page',
      fabAria: 'Open the assistant fan',
      fabClose: 'Close',
      minimizeTitle: 'Collapse to the circle',
      hideTitle: 'Close (reopen from the extension icon)',
      liveHome: 'Connected to the device top page',
      liveImei: 'Connected to the real page',
      liveEtms: 'Connected to the ETMS page',
      liveEims: 'Connected to the EIMS page',
      selectModule: 'Select a module',
      navOnlySuffix: ' · Navigate only',
      typeLabel: 'Device type',
      optAuto: 'Auto',
      optSms: 'SMS',
      optVoice: 'Voice',
      profileSms: 'SMS device',
      profileVoice: 'Voice device',
      profileUnknown: 'Unknown',
      profileAuto: (label, suffix) => `Auto: ${label}${suffix}`,
      profileManual: (label) => `Manual: ${label}`,
      profileSuffix: (detail) => ` (${detail})`,
      profileDetecting: 'Auto: detecting',
      searchPh: 'Search modules…',
      noMatch: 'No matching modules',
      homeNote: 'Only IMEI / ETMS / EIMS act after confirmation; ＋ pins a row to the fan.',
      tagAct: 'Assisted',
      tagNav: 'Navigate',
      tagLoc: 'Locate',
      groupMobile: 'Mobile Setting',
      groupSms: 'SMS Settings',
      groupVoice: 'Voice Settings',
      groupSys: 'System Settings',
      groupOther: 'Other',
      moreLabel: 'More',
      moreName: 'All Modules',
      moreDesc: 'Full searchable list; ＋ pins a module to the fan.',
      moreCap: 'Module list',
      addTitle: 'Pin to fan',
      removeTitle: 'Remove from fan',
      fanFull: 'The fan holds up to 4 modules: remove one in the list first.',
      backModules: '← Modules',
      reading: 'Reading…',
      wfSingle: 'Single',
      wfBatch: 'Batch',
      workflows: {
        single: [
          ['Confirm mode', 'Must be "Specified IMEI prefix"; switching modes submits.'],
          ['Select & fill', 'Choose port and slot, enter a 14- or 15-digit IMEI.'],
          ['Submit & read back', 'Check before/after values, then confirm the real Submit.'],
          ['Save & reboot', 'Only locates the real menu, never runs it.']
        ],
        batch: [
          ['Confirm mode', 'Must be "Specified IMEI prefix".'],
          ['Select range', 'Choose ports and count, enter the 8-digit prefix.'],
          ['Copy', 'Calls the real Copy, only inside the selected range.'],
          ['Auto Complete', 'Calls the real Auto Complete to build full IMEIs.'],
          ['Submit & read back', 'Review changes, then confirm the real Submit.'],
          ['Save & reboot', 'Only locates the real menu, never runs it.']
        ]
      },
      stepTabs: { single: ['Mode', 'Fill', 'Submit', 'Reboot'], batch: ['Mode', 'Range', 'Copy', 'Complete', 'Submit', 'Reboot'] },
      etmsSteps: [
        ['Confirm ETMS block', 'Work only in the device-management block under User & Device.'],
        ['Select ETMS', 'Set the management type to ETMS in the real form; NONE/ERMS is not this flow.'],
        ['Fill registration', 'Fill server, port, account and password in the real form on the right.'],
        ['Preview & submit', 'Check the non-password fields, then confirm the real Submit.'],
        ['Read back status', 'Wait for the real status to become OK; no external registration links.']
      ],
      etmsTabLabels: ['Block', 'Type', 'Fill', 'Submit', 'Status'],
      eimsSteps: [
        ['Confirm EIMS block', 'Work only in the EIMS block under Basic Settings.'],
        ['Select EIMS', 'Set the server type to EIMS in the real form; NONE/EMDA is not this flow.'],
        ['Fill registration', 'Fill server address, UDP/TCP (if present), username and password in the real form.'],
        ['Preview & submit', 'Check the non-password fields, then confirm the real Submit.'],
        ['Save & reboot', 'The EIMS status appears only after save & reboot; the assistant only locates the real menu, never reboots.'],
        ['Read back status', 'After the device reboots and you return, wait for the real status to read OK.']
      ],
      eimsTabLabels: ['Block', 'Type', 'Fill', 'Submit', 'Reboot', 'Status'],
      modeLabels: { 0: 'Specified IMEI prefix', 1: 'Custom range', 3: 'Fetch from ESPS server', 4: 'Fetch from ETMS server' },
      modeUnknown: (mode) => `Unknown mode (${mode})`,
      stepCount: (step, total) => `Step ${step} of ${total}`,
      nextStep: 'Next →',
      lastStep: 'Last step',
      locate: 'Locate this step',
      portLabel: 'Port',
      slotLabel: 'Slot',
      portOption: (port) => `Port ${port}`,
      slotOption: (label) => `Slot ${label}`,
      beforeLabel: 'Before: ',
      emptyValue: '(empty)',
      notFound: 'Not found',
      imeiFormTitle: 'Change IMEI',
      newImeiLabel: 'New IMEI (14/15 digits)',
      imeiPh: 'Full IMEI',
      previewBtn: 'Preview',
      batchFormTitle: 'Batch generate',
      startPortLabel: 'Start port',
      endPortLabel: 'End port',
      perPortLabel: 'Per port',
      prefixLabel: 'First 8 IMEI digits',
      prefixPh: '8 digits',
      scopeLabel: 'Mode',
      scopeEmpty: 'Fill empty only',
      scopeAll: 'Clear range and rebuild',
      batchPrepare: 'Build batch preview',
      targetEmpty: 'Select a range',
      targetIncomplete: 'Select the full range',
      targetSummary: (s, e, n, t) => `Ports ${s}–${e} · ${n} per port · ${t} total`,
      previewTitle: 'Review changes',
      pvTarget: 'Target',
      pvBefore: 'Before',
      pvAfter: 'After',
      targetLine: (port, slotLabel) => `Port ${port} / Slot ${slotLabel}`,
      autoAppend: 'The device appends the 15th digit.',
      autoSaved: 'Saved by the real Submit.',
      autoUnchanged: 'Value unchanged.',
      submitWhole: ' Submit saves the whole form.',
      batchCount: (s, e, t, c) => `Ports ${s}–${e} · target ${t} · changed ${c}`,
      batchAutoNote: 'Generated by the real buttons; Submit saves the whole form.',
      execChange: 'Confirm & change',
      execUnchanged: 'Unchanged, submit anyway',
      execBatch: (n) => `Submit ${n} changes`,
      execRetry: 'Retry Submit (last result unconfirmed)',
      cancelPreview: 'Cancel preview',
      cancelRestore: 'Cancel & restore',
      resultPreview: 'Preview not submitted yet.',
      resultBatchPreview: 'Preview not saved; you can cancel and restore.',
      resultAttemptedImei: 'Real Submit was already attempted; canceling the preview cannot undo device changes. Wait for readback or verify on the real page.',
      resultAttemptedReg: 'Real Submit was already attempted; canceling the preview cannot undo device changes. Wait for the status readback or verify on the real page.',
      etmsFormTitle: 'ETMS Registration',
      etmsNotice: 'Select the ETMS type in the real form on the right and fill in server, port, account and password; the assistant reads only non-password fields and only checks that the password is filled. No ETMS account? Register with your provider first; the assistant never opens external registration links.',
      readPreview: 'Read real form & preview',
      etmsPreviewTitle: 'Review ETMS registration',
      etmsAutoNote: 'Submits the current values of the real form on the right; the password is only checked as filled — never read, shown or stored.',
      execEtms: 'Confirm & submit ETMS registration',
      resultEtmsPreview: 'ETMS preview not submitted yet.',
      etmsNoForm: 'Current: the ETMS form was not found',
      currentEtms: (type, server, port, account, status) => `Current: ${type} · ${server}:${port} · ${account} · Status ${status}`,
      eimsFormTitle: 'EIMS Registration',
      eimsNotice: 'Select the EIMS server type in the real form on the right and fill in server address, UDP/TCP (if present), username and password; the assistant reads only non-password fields and only checks that the password is filled. The registration status appears only after saving and rebooting the device.',
      eimsPreviewTitle: 'Review EIMS registration',
      eimsAutoNote: 'Submits the current values of the real form on the right; the password is only checked as filled — never read, shown or stored. Save and reboot the device for the status to appear.',
      execEims: 'Confirm & submit EIMS registration',
      resultEimsPreview: 'EIMS preview not submitted yet.',
      eimsNoForm: 'Current: the EIMS registration form was not found',
      currentEims: (type, server, protocol, username, status) => `Current: ${type} · ${server}${protocol ? ` · ${protocol}` : ''} · ${username} · Status ${status}`,
      regValue: (type, status) => `${type} · Status ${status}`,
      statusEmpty: 'empty',
      typeUnknown: (type) => `Unknown (${type})`,
      typeUnrecognized: 'unrecognized',
      pvType: 'Type',
      pvServer: 'Server',
      pvPort: 'Port',
      pvAccount: 'Account',
      pvProtocol: 'UDP/TCP',
      pvUsername: 'Username',
      pvPassword: 'Password',
      passwordFilled: 'Filled (never read or shown)',
      privacy: 'Processed locally only',
      rebootGuide: 'Save / Reboot'
    }
  };

  class SkylinePanel {
    constructor(callbacks) {
      this.callbacks = callbacks || {};
      this.controls = [];
      this.mode = null;
      this.workflow = 'single';
      this.step = 1;
      this.plan = null;
      this.busy = false;
      this.isMainPage = false;
      this.modules = [];
      this.activeModuleId = null;
      this.etmsActive = false;
      this.etmsStep = 1;
      this.etmsPlan = null;
      this.etmsCurrent = null;
      this.eimsActive = false;
      this.eimsStep = 1;
      this.eimsPlan = null;
      this.eimsCurrent = null;
      this.viewName = 'home';
      this.pageModule = null;
      this.lastProfile = null;
      this.uiPrefs = { pinned: [...DEFAULT_PINNED], lang: 'auto' };
      this.lang = this.detectPageLang();

      this.host = document.createElement('div');
      this.host.id = 'skyline-page-assistant-host';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = `
        <style>
          :host {
            all: initial;
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            pointer-events: none;
            color: #172033;
            font-family: "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
            font-size: 12.5px;
            line-height: 1.5;
          }
          :host([hidden]) { display: none; }
          * { box-sizing: border-box; }
          button, input, select { font: inherit; }
          button { cursor: pointer; }
          button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: .58; }
          [hidden] { display: none !important; }
          .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

          /* ===== 工作区（设备 infoBox 皮肤） ===== */
          .ws { position: absolute; top: 16px; right: 16px; z-index: 3; width: 320px; max-width: calc(100vw - 32px); pointer-events: auto; }
          .ws-hdr { display: flex; align-items: center; justify-content: space-between; min-height: 24px; padding-left: 8px; padding-right: 2px; border-radius: 4px 4px 0 0; background: #3061AC; color: #fff; font-size: 13px; font-weight: 600; }
          .ws-hdr .ttl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .ws-hright { display: flex; align-items: center; gap: 2px; flex: none; }
          .ws-lang { font-size: 11px; font-weight: 400; }
          .ws-lang a { padding: 0 2px; color: #c8dcf4; text-decoration: none; cursor: pointer; }
          .ws-lang a.on { color: #fff; font-weight: 700; text-decoration: underline; }
          .ws-lang i { color: #7f9cc9; font-style: normal; }
          .hbtn { width: 22px; height: 22px; padding: 0; border: 0; color: #fff; background: transparent; font-size: 14px; font-weight: 600; line-height: 1; }
          .hbtn:hover { background: rgba(255,255,255,.16); }
          .body { max-height: calc(100vh - 148px); padding: 10px; overflow-y: auto; border: 1px solid #5480c3; border-top: none; background: #f9f9f9; }

          /* 首页：设备类型 + 搜索 + 菜单镜像功能表 */
          .d-type { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; padding: 5px 8px; border: 1px solid #5480c3; background: #fff; font-size: 12px; }
          .d-type .lb { flex: none; color: #2b579a; font-weight: 600; }
          .d-type select { flex: none; width: 68px; height: 20px; border: 1px solid #7491b5; background: #fff; font-size: 12px; }
          .d-type .auto { color: blue; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .page-state { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; padding: 3px 8px; border: 1px solid #d5e0ee; background: #fff; font-size: 11.5px; }
          .live { flex: none; color: #14663b; font-weight: 600; }
          .live::before { content: "●"; margin-right: 4px; }
          #module-page-value, #mode-value, #etms-current-value, #eims-current-value { overflow: hidden; color: #536176; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
          .d-search { margin-bottom: 6px; }
          .d-search input { width: 100%; height: 24px; padding: 0 8px; border: 1px solid #7491b5; background: #fff; font-size: 12px; }
          .d-search input:focus { outline: 1px solid #2b579a; }
          .d-notice { margin-bottom: 6px; padding: 4px 8px; border: 1px solid #dcc288; background: #faf3e0; color: #7a5b16; font-size: 11.5px; }
          .d-nomatch { padding: 10px 8px; border: 1px dashed #b9cbe4; background: #fff; color: #6b7a89; font-size: 12px; text-align: center; }
          .d-grp { margin-bottom: 8px; }
          .d-grp-h { display: flex; justify-content: space-between; align-items: baseline; height: 20px; line-height: 20px; padding: 0 8px; border-radius: 3px 3px 0 0; background: #3061AC; color: #fff; font-size: 11.5px; font-weight: 600; }
          .d-grp-h .cnt { color: #c8dcf4; font-size: 10.5px; font-weight: 400; }
          .d-grp-b { border: 1px solid #5480c3; border-top: none; background: #fff; }
          .d-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px 4px 8px; border-top: 1px solid #dce6f2; cursor: pointer; }
          .d-row:first-child { border-top: none; }
          .d-row:hover { background: #eef4fb; }
          .d-row.active { background: #dbe7f7; }
          .d-row .tx { flex: 1; min-width: 0; }
          .d-row strong { display: block; color: #1f3f6e; font-size: 12.5px; font-weight: 600; }
          .d-row .ds { display: block; margin-top: 1px; overflow: hidden; color: #6b7a89; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
          .d-row .path { color: #2b579a; }
          .d-tag { flex: none; padding: 1px 6px; border: 1px solid; border-radius: 2px; font-size: 10.5px; }
          .d-tag.act { color: #1c5c34; border-color: #9cc7ab; background: #e9f5ec; }
          .d-tag.nav { color: #5d6b7a; border-color: #c3ccd5; background: #f2f5f8; }
          .d-tag.loc { color: #7a5b16; border-color: #dcc288; background: #faf3e0; }
          .d-add { display: flex; flex: none; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 1.2px solid #2b579a; border-radius: 50%; background: #fff; color: #2b579a; font-size: 13px; line-height: 1; }
          .d-add:hover { transform: scale(1.12); }
          .d-add.pinned { background: #2b579a; color: #fff; }
          .module-note { margin: 2px 0 0; color: blue; font-size: 11px; }

          /* 工作区内部（步骤 / 表单 / 预览） */
          .back-button { margin-bottom: 6px; }
          .link-button { padding: 2px 0; border: 0; color: #175f96; background: transparent; font-size: 12px; }
          .workflows { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
          .workflow-button { height: 24px; border: 1px solid #9aa5b1; border-radius: 2px; background: linear-gradient(#fdfdfd,#dfe3e8); color: #222; font-size: 12px; }
          .workflow-button.active { border-color: #274f8d; background: linear-gradient(#3a6cba,#2b57a0); color: #fff; font-weight: 600; }
          .steps { display: flex; flex-direction: column; margin-bottom: 8px; border: 1px solid #b9cbe4; background: #fff; }
          .step-tab { display: block; width: 100%; min-height: 22px; padding: 2px 8px; border: 0; border-top: 1px solid #dce6f2; background: #fff; color: #333; font-size: 12px; text-align: left; }
          .step-tab:first-child { border-top: none; }
          .step-tab[aria-current="step"] { background: #dbe7f7; color: #2b579a; font-weight: 600; }
          .guide { margin-bottom: 8px; padding: 8px 10px; border: 1px solid #b9cbe4; background: #fff; }
          #step-count, #etms-step-count, #eims-step-count { color: #2b579a; font-size: 11.5px; font-weight: 600; }
          #step-title, #etms-step-title, #eims-step-title { margin: 2px 0 3px; font-size: 13.5px; }
          #step-description, #etms-step-description, #eims-step-description { margin: 0; color: #444; font-size: 12px; }
          .guide-actions { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; }
          .form-title { margin: 10px 0 6px; color: #2b579a; font-size: 12.5px; }
          .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
          .field-row.three { grid-template-columns: 1fr 1fr .85fr; gap: 6px; }
          .field { display: block; margin-bottom: 6px; color: #536176; font-size: 11px; }
          .field input, .field select { display: block; width: 100%; height: 24px; margin-top: 2px; padding: 2px 6px; border: 1px solid #7491b5; border-radius: 0; background: #fff; color: #172033; font-size: 12px; }
          .field input:focus, .field select:focus { outline: 1px solid #2b579a; }
          .target-summary { margin: 2px 0 8px; padding: 5px 8px; border: 1px solid #d5e0ee; background: #fff; color: #265271; font-size: 12px; font-weight: 600; }
          .current { margin: 2px 0 8px; padding: 5px 8px; border: 1px solid #5480c3; background: #fff; color: #333; font-size: 12px; overflow-wrap: anywhere; }
          .notice { margin: 6px 0 8px; color: blue; font-size: 11.5px; line-height: 1.5; }
          .primary { width: 100%; min-height: 26px; padding: 4px 10px; border: 1px solid #274f8d; border-radius: 2px; background: linear-gradient(#3a6cba,#2b57a0); color: #fff; font-size: 12px; font-weight: 600; }
          .secondary { width: 100%; min-height: 24px; margin-top: 6px; padding: 3px 10px; border: 1px solid #9aa5b1; border-radius: 2px; background: linear-gradient(#fdfdfd,#dfe3e8); color: #222; font-size: 12px; }
          .preview { margin-top: 8px; padding: 8px 10px; border: 1px solid #5480c3; background: #fff; }
          .preview-title { margin-bottom: 6px; color: #2b579a; font-size: 12.5px; font-weight: 600; }
          .change-line { margin: 3px 0; font-size: 12px; overflow-wrap: anywhere; }
          .change-line span { display: inline-block; min-width: 52px; color: #55677c; }
          .auto-note { margin: 6px 0 8px; color: blue; font-size: 11.5px; line-height: 1.5; }
          .batch-list { max-height: 160px; margin: 7px 0; overflow-y: auto; border: 1px solid #b9cbe4; background: #fff; }
          .batch-row { padding: 4px 6px; border-bottom: 1px solid #e3ecf6; font-family: Consolas, monospace; font-size: 10px; overflow-wrap: anywhere; }
          .batch-row:last-child { border-bottom: 0; }
          .result { margin-top: 8px; padding: 8px 10px; border: 1px solid; font-size: 12px; overflow-wrap: anywhere; }
          .result.info { color: #265271; border-color: #b9cbe4; background: #edf5fa; }
          .result.success { color: #14663b; border-color: #9cc7ab; background: #eaf7ef; }
          .result.failure { color: #9c2727; border-color: #e3b1b1; background: #fff0f0; }
          .result.unconfirmed { color: #795510; border-color: #dcc288; background: #fff6df; }
          .footer { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 8px; }
          .privacy { margin: 0; color: #718096; font-size: 10px; }

          /* ===== 扇形启动器 ===== */
          .fab-zone { position: absolute; right: 26px; bottom: 26px; z-index: 5; width: 52px; height: 52px; pointer-events: auto; }
          .fab { position: absolute; inset: 0; z-index: 2; width: 52px; height: 52px; border: 2px solid #1e406f; border-radius: 50%; background: #2b579a; color: #fff; font-family: Arial, sans-serif; font-size: 8.5px; font-weight: 800; font-style: italic; letter-spacing: .06em; box-shadow: 0 2px 10px rgba(20,50,90,.35); transition: transform .18s ease; }
          .fab:hover { transform: scale(1.06); }
          .fab .active-dot { position: absolute; top: -2px; right: -2px; display: none; width: 11px; height: 11px; border: 2px solid #fff; border-radius: 50%; background: #2f9e63; }
          .fab-zone.has-active .fab .active-dot { display: block; }
          .fan-item { position: absolute; left: 6px; top: 6px; z-index: 1; width: 40px; height: 40px; border: 1.5px solid #2b579a; border-radius: 50%; background: #fff; color: #2b579a; font-size: 11px; font-weight: 600; opacity: 0; transform: translate(0,0) scale(.3); transition: transform .22s cubic-bezier(.2,.9,.3,1.2), opacity .18s ease, box-shadow .15s ease; pointer-events: none; }
          .fab-zone.en .fan-item { font-size: 9.5px; }
          .fan-item:hover { box-shadow: 0 3px 10px rgba(20,50,90,.3); }
          .fan-item.utility { border-style: dashed; font-weight: 400; }
          .fab-zone.open .fan-item { opacity: 1; transform: translate(var(--fx), var(--fy)) scale(1); pointer-events: auto; }
          .fab-zone.open .fan-item:hover { transform: translate(var(--fx), var(--fy)) scale(1.16); }
          .fan-card { position: absolute; right: 26px; bottom: 216px; z-index: 6; width: 224px; pointer-events: auto; }
          .fan-card .fc-hdr { height: 24px; line-height: 24px; padding-left: 8px; border-radius: 4px 4px 0 0; background: #3061AC; color: #fff; font-size: 12.5px; font-weight: 600; }
          .fan-card .fc-body { padding: 8px 10px; border: 1px solid #5480c3; border-top: none; background: #fff; }
          .fan-card .fc-desc { margin: 0 0 5px; color: #333; font-size: 12px; line-height: 1.5; }
          .fan-card .fc-cap { display: inline-block; padding: 1px 7px; border: 1px solid #9cc7ab; border-radius: 2px; background: #e9f5ec; color: #1c5c34; font-size: 11px; }
          @media (prefers-reduced-motion: reduce) { .fab, .fan-item { transition: none; } }
          @media (max-width: 420px) {
            .ws { top: 8px; right: 8px; width: calc(100vw - 16px); max-width: none; }
            .body { max-height: calc(100vh - 128px); }
            .fab-zone { right: 16px; bottom: 16px; }
            .fan-card { right: 16px; bottom: 206px; }
          }
        </style>
        <section class="ws" id="ws" aria-label="SKYLINE 页面助手" hidden>
          <header class="ws-hdr">
            <span class="ttl" id="view-title">功能导航</span>
            <span class="sr-only" id="shell-subtitle">全局助手 · 顶层页面模式</span>
            <span class="ws-hright">
              <span class="ws-lang"><a id="lang-zh" class="on">中</a><i>|</i><a id="lang-en">EN</a></span>
              <button class="hbtn" id="minimize" type="button" data-i18n-title="minimizeTitle" title="收起为圆形">－</button>
              <button class="hbtn" id="hide" type="button" data-i18n-title="hideTitle" title="关闭（点击扩展图标可重新打开）">×</button>
            </span>
          </header>
          <div class="body" id="assistant-body">
            <section id="module-home">
              <div class="d-type"><span class="lb" data-i18n="typeLabel">设备类型</span><select id="profile-preference" aria-label="设备类型"><option value="auto" data-i18n="optAuto">自动</option><option value="sms" data-i18n="optSms">短信</option><option value="voice" data-i18n="optVoice">语音</option></select><span class="auto" id="profile-status" data-i18n="profileDetecting">自动：识别中</span></div>
              <div class="page-state"><span class="live" data-i18n="liveHome">已连接设备主页面</span><span id="module-page-value">请选择功能</span></div>
              <div class="d-search"><input id="module-search" type="search" data-i18n-ph="searchPh" placeholder="搜索功能…"></div>
              <div class="d-notice" id="fan-notice" hidden></div>
              <div class="module-list" id="module-list"></div>
              <div class="d-nomatch" id="module-nomatch" data-i18n="noMatch" hidden>没有匹配的功能</div>
              <p class="module-note" data-i18n="homeNote">仅 IMEI / ETMS / EIMS 在确认后代操作；行尾 ＋ 把功能固定到扇形。</p>
            </section>
            <section class="workspace" id="imei-workspace" hidden>
            <button class="link-button back-button" id="back-modules" type="button" data-i18n="backModules">← 功能列表</button>
            <div class="page-state"><span class="live" data-i18n="liveImei">已连接真实页面</span><span id="mode-value" data-i18n="reading">正在读取…</span></div>
            <div class="workflows">
              <button class="workflow-button" type="button" data-workflow="single" data-i18n="wfSingle">单个修改</button>
              <button class="workflow-button" type="button" data-workflow="batch" data-i18n="wfBatch">批量修改</button>
            </div>
            <nav class="steps" id="steps" aria-label="操作步骤"></nav>
            <section class="guide">
              <span id="step-count"></span><h2 id="step-title"></h2><p id="step-description"></p>
              <div class="guide-actions"><button class="link-button" id="locate" type="button" data-i18n="locate">定位本步</button><button class="link-button" id="next-step" type="button">下一步 →</button></div>
            </section>

            <form id="change-form">
              <h3 class="form-title" data-i18n="imeiFormTitle">修改 IMEI</h3>
              <div class="field-row">
                <label class="field"><span data-i18n="portLabel">端口</span><select id="port-select" data-operation required></select></label>
                <label class="field"><span data-i18n="slotLabel">槽位</span><select id="slot-select" data-operation required></select></label>
              </div>
              <div class="current"><span data-i18n="beforeLabel">原值：</span><strong id="current-value">—</strong></div>
              <label class="field"><span data-i18n="newImeiLabel">新 IMEI（14/15 位）</span><input id="imei-input" data-operation type="text" inputmode="numeric" autocomplete="off" maxlength="15" data-i18n-ph="imeiPh" placeholder="输入完整 IMEI" required></label>
              <button class="primary" id="preview-button" data-operation type="submit" data-i18n="previewBtn">预览</button>
            </form>

            <form id="batch-form" hidden>
              <h3 class="form-title" data-i18n="batchFormTitle">批量生成</h3>
              <div class="field-row three">
                <label class="field"><span data-i18n="startPortLabel">起始端口</span><select id="batch-start-port" data-operation></select></label>
                <label class="field"><span data-i18n="endPortLabel">结束端口</span><select id="batch-end-port" data-operation></select></label>
                <label class="field"><span data-i18n="perPortLabel">每端口</span><input id="batch-slot-count" data-operation type="number" min="1" step="1" value="32" required></label>
              </div>
              <div class="target-summary" id="batch-target">请选择范围</div>
              <label class="field"><span data-i18n="prefixLabel">IMEI 前 8 位</span><input id="batch-prefix" data-operation type="text" inputmode="numeric" autocomplete="off" maxlength="8" data-i18n-ph="prefixPh" placeholder="8 位数字" required></label>
              <label class="field"><span data-i18n="scopeLabel">处理方式</span>
                <select id="batch-scope" data-operation>
                  <option value="empty" data-i18n="scopeEmpty">仅填空白</option>
                  <option value="all" data-i18n="scopeAll">清空所选范围后重建</option>
                </select>
              </label>
              <button class="primary" id="batch-prepare" data-operation type="submit" data-i18n="batchPrepare">生成批量预览</button>
            </form>

            <section class="preview" id="preview" hidden>
              <div class="preview-title" data-i18n="previewTitle">核对变更</div>
              <div id="single-preview">
                <div class="change-line"><span data-i18n="pvTarget">目标</span><strong id="preview-target"></strong></div>
                <div class="change-line"><span data-i18n="pvBefore">原值</span><strong id="preview-before"></strong></div>
                <div class="change-line"><span data-i18n="pvAfter">新值</span><strong id="preview-after"></strong></div>
              </div>
              <div id="batch-preview" hidden><div class="change-line" id="batch-count"></div><div class="batch-list" id="batch-list"></div></div>
              <div class="auto-note" id="auto-note"></div>
              <button class="primary" id="execute-button" type="button">确认并修改</button>
              <button class="secondary" id="cancel-preview" type="button">取消预览</button>
            </section>
            </section>
            <section class="workspace" id="etms-workspace" hidden>
            <button class="link-button back-button" id="etms-back-modules" type="button" data-i18n="backModules">← 功能列表</button>
            <div class="page-state"><span class="live" data-i18n="liveEtms">已连接 ETMS 页面</span><span id="etms-current-value" data-i18n="reading">正在读取…</span></div>
            <nav class="steps" id="etms-steps" aria-label="ETMS 注册步骤"></nav>
            <section class="guide">
              <span id="etms-step-count"></span><h2 id="etms-step-title"></h2><p id="etms-step-description"></p>
              <div class="guide-actions"><button class="link-button" id="etms-locate" type="button" data-i18n="locate">定位本步</button><button class="link-button" id="etms-next-step" type="button">下一步 →</button></div>
            </section>
            <form id="etms-form">
              <h3 class="form-title" data-i18n="etmsFormTitle">ETMS 注册</h3>
              <div class="current" id="etms-current">当前：正在读取…</div>
              <div class="notice" data-i18n="etmsNotice">请直接在右侧真实表单中选择 ETMS 类型，并填写服务器、端口、账号和密码；助手只读取非密码字段，密码只检查是否已填写。没有 ETMS 账号？请先在服务商处注册；助手不会打开外部注册链接。</div>
              <button class="primary" id="etms-preview-button" data-etms-operation type="submit" data-i18n="readPreview">读取真实表单并预览</button>
            </form>
            <section class="preview" id="etms-preview" hidden>
              <div class="preview-title" data-i18n="etmsPreviewTitle">核对 ETMS 注册</div>
              <div class="change-line"><span data-i18n="pvType">类型</span><strong id="etms-preview-type"></strong></div>
              <div class="change-line"><span data-i18n="pvServer">服务器</span><strong id="etms-preview-server"></strong></div>
              <div class="change-line"><span data-i18n="pvPort">端口</span><strong id="etms-preview-port"></strong></div>
              <div class="change-line"><span data-i18n="pvAccount">账号</span><strong id="etms-preview-account"></strong></div>
              <div class="change-line"><span data-i18n="pvPassword">密码</span><strong id="etms-preview-password">已填写（不读取、不显示）</strong></div>
              <div class="auto-note" id="etms-auto-note"></div>
              <button class="primary" id="etms-execute-button" type="button">确认并提交</button>
              <button class="secondary" id="etms-cancel-preview" type="button" data-i18n="cancelPreview">取消预览</button>
            </section>
            </section>
            <section class="workspace" id="eims-workspace" hidden>
            <button class="link-button back-button" id="eims-back-modules" type="button" data-i18n="backModules">← 功能列表</button>
            <div class="page-state"><span class="live" data-i18n="liveEims">已连接 EIMS 页面</span><span id="eims-current-value" data-i18n="reading">正在读取…</span></div>
            <nav class="steps" id="eims-steps" aria-label="EIMS 注册步骤"></nav>
            <section class="guide">
              <span id="eims-step-count"></span><h2 id="eims-step-title"></h2><p id="eims-step-description"></p>
              <div class="guide-actions"><button class="link-button" id="eims-locate" type="button" data-i18n="locate">定位本步</button><button class="link-button" id="eims-next-step" type="button">下一步 →</button></div>
            </section>
            <form id="eims-form">
              <h3 class="form-title" data-i18n="eimsFormTitle">EIMS 注册</h3>
              <div class="current" id="eims-current">当前：正在读取…</div>
              <div class="notice" data-i18n="eimsNotice">请直接在右侧真实表单中选择 EIMS 服务器类型，并填写服务器地址、UDP/TCP（如有）、用户名和密码；助手只读取非密码字段，密码只检查是否已填写。注册状态必须保存并重启设备后才会显示。</div>
              <button class="primary" id="eims-preview-button" data-eims-operation type="submit" data-i18n="readPreview">读取真实表单并预览</button>
            </form>
            <section class="preview" id="eims-preview" hidden>
              <div class="preview-title" data-i18n="eimsPreviewTitle">核对 EIMS 注册</div>
              <div class="change-line"><span data-i18n="pvType">类型</span><strong id="eims-preview-type"></strong></div>
              <div class="change-line"><span data-i18n="pvServer">服务器</span><strong id="eims-preview-server"></strong></div>
              <div class="change-line" id="eims-preview-protocol-row"><span data-i18n="pvProtocol">UDP/TCP</span><strong id="eims-preview-protocol"></strong></div>
              <div class="change-line"><span data-i18n="pvUsername">用户名</span><strong id="eims-preview-username"></strong></div>
              <div class="change-line"><span data-i18n="pvPassword">密码</span><strong id="eims-preview-password">已填写（不读取、不显示）</strong></div>
              <div class="auto-note" id="eims-auto-note"></div>
              <button class="primary" id="eims-execute-button" type="button">确认并提交</button>
              <button class="secondary" id="eims-cancel-preview" type="button" data-i18n="cancelPreview">取消预览</button>
            </section>
            </section>
            <div class="result" id="result" role="status" aria-live="polite" hidden></div>
            <div class="footer"><p class="privacy" data-i18n="privacy">仅本机处理</p><button class="link-button" id="reboot-guide" type="button" data-i18n="rebootGuide">保存 / 重启</button></div>
          </div>
        </section>
        <div class="fan-card" id="fan-card" hidden>
          <div class="fc-hdr" id="fc-name"></div>
          <div class="fc-body"><p class="fc-desc" id="fc-desc"></p><span class="fc-cap" id="fc-cap"></span></div>
        </div>
        <div class="fab-zone" id="fab-zone">
          <button class="fab" id="fab" type="button" aria-label="打开助手功能扇形"><span id="fab-label">SKYLINE</span><span class="active-dot"></span></button>
        </div>`;

      (document.body || document.documentElement).appendChild(this.host);
      this.wsElement = this.shadow.getElementById('ws');
      this.fabZone = this.shadow.getElementById('fab-zone');
      this.fab = this.shadow.getElementById('fab');
      this.fabLabel = this.shadow.getElementById('fab-label');
      this.fanCard = this.shadow.getElementById('fan-card');
      this.body = this.shadow.getElementById('assistant-body');
      this.portSelect = this.shadow.getElementById('port-select');
      this.slotSelect = this.shadow.getElementById('slot-select');
      this.imeiInput = this.shadow.getElementById('imei-input');
      this.batchStartPort = this.shadow.getElementById('batch-start-port');
      this.batchEndPort = this.shadow.getElementById('batch-end-port');
      this.batchSlotCount = this.shadow.getElementById('batch-slot-count');
      this.batchPrefix = this.shadow.getElementById('batch-prefix');
      this.batchScope = this.shadow.getElementById('batch-scope');
      this.previewButton = this.shadow.getElementById('preview-button');
      this.batchPrepareButton = this.shadow.getElementById('batch-prepare');
      this.executeButton = this.shadow.getElementById('execute-button');
      this.previewSection = this.shadow.getElementById('preview');
      this.resultElement = this.shadow.getElementById('result');
      this.moduleHome = this.shadow.getElementById('module-home');
      this.imeiWorkspace = this.shadow.getElementById('imei-workspace');
      this.etmsWorkspace = this.shadow.getElementById('etms-workspace');
      this.etmsPreviewButton = this.shadow.getElementById('etms-preview-button');
      this.etmsPreviewSection = this.shadow.getElementById('etms-preview');
      this.etmsExecuteButton = this.shadow.getElementById('etms-execute-button');
      this.eimsWorkspace = this.shadow.getElementById('eims-workspace');
      this.eimsPreviewButton = this.shadow.getElementById('eims-preview-button');
      this.eimsPreviewSection = this.shadow.getElementById('eims-preview');
      this.eimsExecuteButton = this.shadow.getElementById('eims-execute-button');
      this.moduleList = this.shadow.getElementById('module-list');
      this.moduleSearch = this.shadow.getElementById('module-search');
      this.profilePreference = this.shadow.getElementById('profile-preference');

      this.shadow.getElementById('minimize').addEventListener('click', () => this.setWsVisible(false));
      this.shadow.getElementById('hide').addEventListener('click', () => this.toggle(false));
      this.shadow.getElementById('lang-zh').addEventListener('click', () => this.setLangPref('zh'));
      this.shadow.getElementById('lang-en').addEventListener('click', () => this.setLangPref('en'));
      this.fab.addEventListener('click', () => {
        if (this.fabZone.classList.contains('open')) this.closeFan();
        else this.openFan();
      });
      this.moduleSearch.addEventListener('input', () => this.applyModuleFilter());
      this.shadow.getElementById('locate').addEventListener('click', () => this.emit('onStep', this.step));
      this.shadow.getElementById('next-step').addEventListener('click', () => this.emit('onStep', Math.min(this.T().workflows[this.workflow].length, this.step + 1)));
      this.shadow.getElementById('reboot-guide').addEventListener('click', () => this.emit('onRebootGuide'));
      this.shadow.getElementById('back-modules').addEventListener('click', () => this.emit('onBackModules'));
      this.shadow.getElementById('etms-back-modules').addEventListener('click', () => this.emit('onBackModules'));
      this.shadow.getElementById('etms-locate').addEventListener('click', () => this.emit('onEtmsStep', this.etmsStep));
      this.shadow.getElementById('etms-next-step').addEventListener('click', () => this.emit('onEtmsStep', Math.min(this.T().etmsSteps.length, this.etmsStep + 1)));
      this.shadow.getElementById('eims-back-modules').addEventListener('click', () => this.emit('onBackModules'));
      this.shadow.getElementById('eims-locate').addEventListener('click', () => this.emit('onEimsStep', this.eimsStep));
      this.shadow.getElementById('eims-next-step').addEventListener('click', () => this.emit('onEimsStep', Math.min(this.T().eimsSteps.length, this.eimsStep + 1)));
      this.profilePreference.addEventListener('change', () => this.emit('onProfileChange', this.profilePreference.value));
      this.moduleList.addEventListener('click', (event) => {
        const pin = event.target.closest('[data-pin]');
        if (pin) {
          event.stopPropagation();
          this.togglePin(pin.dataset.pin);
          return;
        }
        const row = event.target.closest('[data-module-id]');
        if (row) this.emit('onModuleOpen', row.dataset.moduleId);
      });
      this.shadow.querySelectorAll('[data-workflow]').forEach((button) => {
        button.addEventListener('click', () => this.emit('onWorkflowChange', button.dataset.workflow));
      });
      this.portSelect.addEventListener('change', () => {
        this.renderSlots();
        this.clearPreview();
        this.emit('onTargetChange', this.getSelection());
      });
      this.slotSelect.addEventListener('change', () => {
        this.updateCurrentValue();
        this.clearPreview();
        this.emit('onTargetChange', this.getSelection());
      });
      this.imeiInput.addEventListener('input', () => this.clearPreview());
      this.batchPrefix.addEventListener('input', () => this.clearPreview());
      this.batchScope.addEventListener('change', () => this.clearPreview());
      this.batchStartPort.addEventListener('change', () => {
        if (Number(this.batchStartPort.value) > Number(this.batchEndPort.value)) this.batchEndPort.value = this.batchStartPort.value;
        this.clearPreview();
        this.updateBatchTargetSummary();
      });
      this.batchEndPort.addEventListener('change', () => {
        if (Number(this.batchEndPort.value) < Number(this.batchStartPort.value)) this.batchStartPort.value = this.batchEndPort.value;
        this.clearPreview();
        this.updateBatchTargetSummary();
      });
      this.batchSlotCount.addEventListener('input', () => {
        this.clearPreview();
        this.updateBatchTargetSummary();
      });
      this.shadow.getElementById('change-form').addEventListener('submit', (event) => {
        event.preventDefault();
        if (!this.busy) this.emit('onPreview', this.getSelection());
      });
      this.shadow.getElementById('batch-form').addEventListener('submit', (event) => {
        event.preventDefault();
        if (!this.busy) this.emit('onBatchPrepare', this.getBatchSelection());
      });
      this.shadow.getElementById('etms-form').addEventListener('submit', (event) => {
        event.preventDefault();
        if (!this.busy) this.emit('onEtmsPreview');
      });
      this.etmsExecuteButton.addEventListener('click', () => {
        if (!this.busy && this.etmsPlan) this.emit('onEtmsExecute', this.etmsPlan);
      });
      this.shadow.getElementById('etms-cancel-preview').addEventListener('click', () => {
        if (this.busy || !this.etmsPlan) return;
        if (this.etmsPlan.attempted) {
          this.setResult('unconfirmed', this.T().resultAttemptedReg);
          return;
        }
        this.emit('onEtmsCancel', this.etmsPlan);
      });
      this.shadow.getElementById('eims-form').addEventListener('submit', (event) => {
        event.preventDefault();
        if (!this.busy) this.emit('onEimsPreview');
      });
      this.eimsExecuteButton.addEventListener('click', () => {
        if (!this.busy && this.eimsPlan) this.emit('onEimsExecute', this.eimsPlan);
      });
      this.shadow.getElementById('eims-cancel-preview').addEventListener('click', () => {
        if (this.busy || !this.eimsPlan) return;
        if (this.eimsPlan.attempted) {
          this.setResult('unconfirmed', this.T().resultAttemptedReg);
          return;
        }
        this.emit('onEimsCancel', this.eimsPlan);
      });
      this.executeButton.addEventListener('click', () => {
        if (!this.busy && this.plan) this.emit('onExecute', this.plan);
      });
      this.shadow.getElementById('cancel-preview').addEventListener('click', () => {
        if (this.busy || !this.plan) return;
        if (this.plan.attempted) {
          this.setResult('unconfirmed', this.T().resultAttemptedImei);
          return;
        }
        if (this.plan.kind === 'batch') this.emit('onBatchCancel', this.plan);
        else this.clearPreview();
      });
      this._onKeydown = (event) => { if (event.key === 'Escape') this.closeFan(); };
      this._onDocumentClick = (event) => {
        if (this.fabZone.classList.contains('open') && event.target !== this.host) this.closeFan();
      };
      document.addEventListener('keydown', this._onKeydown);
      document.addEventListener('click', this._onDocumentClick);

      this.applyLang();
      this.setWorkflow('single');
      this.setShell(false);
      this.loadUiPrefs();
    }

    emit(name, value) {
      if (typeof this.callbacks[name] === 'function') this.callbacks[name](value);
    }

    T() {
      return I18N[this.lang] || I18N.zh;
    }

    detectPageLang() {
      try {
        return /_en\.html?$/i.test(location.pathname) ? 'en' : 'zh';
      } catch (error) {
        return 'zh';
      }
    }

    /* 界面偏好：默认立即生效（固定 4 项 + 跟随页面语言），异步读取已保存值；
       读取失败（如无代理环境）时保持默认，不影响任何业务功能。 */
    loadUiPrefs() {
      this.uiStorage('get').then((value) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value.pinned)) {
          this.uiPrefs.pinned = [...new Set(value.pinned.filter((id) => typeof id === 'string'))].slice(0, FAN_MAX);
        }
        if (value.lang === 'auto' || value.lang === 'zh' || value.lang === 'en') {
          this.uiPrefs.lang = value.lang;
        }
        const nextLang = this.uiPrefs.lang === 'auto' ? this.detectPageLang() : this.uiPrefs.lang;
        if (nextLang !== this.lang) {
          this.lang = nextLang;
          this.applyLang();
        }
        this.renderFan();
        this.refreshPinButtons();
      }).catch(() => {});
    }

    saveUiPrefs() {
      this.uiStorage('set', { pinned: [...this.uiPrefs.pinned], lang: this.uiPrefs.lang }).catch(() => {});
    }

    uiStorage(action, value) {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return Promise.reject(new Error('界面偏好代理不可用。'));
      }
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: `skyline.ui.${action}`, key: UI_PREFS_KEY, value }, (response) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else if (!response || !response.ok) reject(new Error((response && response.error) || '界面偏好读写失败。'));
          else resolve(response.value);
        });
      });
    }

    setLangPref(lang) {
      if (lang !== 'auto' && lang !== 'zh' && lang !== 'en') return;
      this.uiPrefs.lang = lang;
      const nextLang = lang === 'auto' ? this.detectPageLang() : lang;
      this.saveUiPrefs();
      if (nextLang !== this.lang) {
        this.lang = nextLang;
        this.applyLang();
      }
    }

    /* 语言切换只重渲染面板自有文案；controller 产生的业务消息保持原样。 */
    applyLang() {
      const T = this.T();
      this.shadow.querySelectorAll('[data-i18n]').forEach((el) => {
        const value = T[el.dataset.i18n];
        if (typeof value === 'string') el.textContent = value;
      });
      this.shadow.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        const value = T[el.dataset.i18nPh];
        if (typeof value === 'string') el.placeholder = value;
      });
      this.shadow.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const value = T[el.dataset.i18nTitle];
        if (typeof value === 'string') el.title = value;
      });
      this.fab.setAttribute('aria-label', T.fabAria);
      this.shadow.getElementById('lang-zh').classList.toggle('on', this.lang === 'zh');
      this.shadow.getElementById('lang-en').classList.toggle('on', this.lang === 'en');
      this.renderViewTitle();
      this.renderSubtitle();
      this.renderPageValue();
      if (this.lastProfile) this.setProfileState(...this.lastProfile);
      this.renderModuleList();
      this.renderFan();
      this.renderStepTabs();
      this.setStep(this.step);
      this.renderEtmsStepTabs();
      this.setEtmsStep(this.etmsStep);
      this.renderEimsStepTabs();
      this.setEimsStep(this.eimsStep);
      if (this.controls.length) {
        this.renderModeValue();
        this.updateCurrentValue();
        this.updateBatchTargetSummary();
      }
      if (this.etmsActive) this.updateEtmsCurrent();
      if (this.eimsActive) this.updateEimsCurrent();
      if (this.plan) {
        if (this.plan.kind === 'batch') this.fillBatchPreview(this.plan);
        else this.fillSinglePreview(this.plan);
      }
      if (this.etmsPlan) this.fillEtmsPreview(this.etmsPlan);
      if (this.eimsPlan) this.fillEimsPreview(this.eimsPlan);
    }

    renderViewTitle() {
      const T = this.T();
      this.shadow.getElementById('view-title').textContent = this.viewName === 'home'
        ? T.viewHome
        : `${this.moduleNameById(this.viewName)}${T.guideSuffix}`;
    }

    renderSubtitle() {
      const T = this.T();
      const key = this.viewName === 'home'
        ? 'subtitleHome'
        : `subtitle${this.viewName === 'imei' ? 'Imei' : (this.viewName === 'etms-registration' ? 'Etms' : 'Eims')}${this.isMainPage ? 'Main' : 'Frame'}`;
      this.shadow.getElementById('shell-subtitle').textContent = T[key] || T.subtitleHome;
    }

    renderModeValue() {
      const T = this.T();
      this.shadow.getElementById('mode-value').textContent = T.modeLabels[this.mode] || T.modeUnknown(this.mode);
    }

    moduleMeta(id) {
      return MODULE_META[id] || null;
    }

    moduleNameById(id) {
      const module = this.modules.find((item) => item.id === id);
      if (module) return this.moduleName(module);
      const meta = this.moduleMeta(id);
      if (meta) return meta.name[this.lang] || meta.name.zh;
      return id;
    }

    moduleName(module) {
      const meta = this.moduleMeta(module.id);
      if (this.lang === 'en') return (meta && meta.name.en) || module.name;
      return module.name;
    }

    setWsVisible(visible) {
      this.wsElement.hidden = !visible;
      this.fabZone.classList.toggle('has-active', Boolean(visible));
      if (!visible) this.closeFan();
    }

    openFan() {
      this.renderFan();
      this.fabZone.classList.add('open');
      this.fabLabel.textContent = this.T().fabClose;
    }

    closeFan() {
      this.fabZone.classList.remove('open');
      this.fanCard.hidden = true;
      this.fabLabel.textContent = this.fabZone.classList.contains('open') ? this.T().fabClose : 'SKYLINE';
    }

    renderFan() {
      const T = this.T();
      this.fabZone.querySelectorAll('.fan-item').forEach((button) => button.remove());
      const ids = [...this.uiPrefs.pinned, 'more'];
      const count = ids.length;
      ids.forEach((id, index) => {
        const deg = count === 1 ? 136 : 100 + index * (72 / (count - 1));
        const rad = deg * Math.PI / 180;
        const meta = this.moduleMeta(id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fan-item' + (id === 'more' ? ' utility' : '');
        button.textContent = id === 'more' ? T.moreLabel : ((meta && meta.label[this.lang]) || this.moduleNameById(id));
        button.style.transitionDelay = `${index * 28}ms`;
        button.style.setProperty('--fx', `${(FAN_RADIUS * Math.cos(rad) - 6).toFixed(1)}px`);
        button.style.setProperty('--fy', `${(-FAN_RADIUS * Math.sin(rad) - 6).toFixed(1)}px`);
        button.addEventListener('mouseenter', () => {
          const tag = this.moduleTag(id);
          this.shadow.getElementById('fc-name').textContent = id === 'more' ? T.moreName : this.moduleNameById(id);
          this.shadow.getElementById('fc-desc').textContent = id === 'more' ? T.moreDesc : ((meta && meta.desc[this.lang]) || '');
          this.shadow.getElementById('fc-cap').textContent = id === 'more' ? T.moreCap : T[tag.labelKey];
          this.fanCard.hidden = false;
        });
        button.addEventListener('mouseleave', () => { this.fanCard.hidden = true; });
        button.addEventListener('click', () => {
          this.closeFan();
          if (id === 'more') {
            this.setWsVisible(true);
            if (this.moduleHome.hidden) this.emit('onBackModules');
          } else {
            this.emit('onModuleOpen', id);
          }
        });
        this.fabZone.appendChild(button);
      });
      this.fabZone.classList.toggle('en', this.lang === 'en');
      this.fabLabel.textContent = this.fabZone.classList.contains('open') ? T.fabClose : 'SKYLINE';
    }

    moduleTag(id) {
      const module = this.modules.find((item) => item.id === id);
      const capability = module ? module.capability : 'navigation';
      if (capability === 'operation') return { className: 'act', labelKey: 'tagAct' };
      if (capability === 'guide') return { className: 'loc', labelKey: 'tagLoc' };
      return { className: 'nav', labelKey: 'tagNav' };
    }

    togglePin(id) {
      const pinned = this.uiPrefs.pinned;
      if (pinned.includes(id)) {
        this.uiPrefs.pinned = pinned.filter((item) => item !== id);
        this.hideFanNotice();
      } else {
        if (pinned.length >= FAN_MAX) {
          this.showFanNotice(this.T().fanFull);
          return;
        }
        this.uiPrefs.pinned = [...pinned, id];
        this.hideFanNotice();
      }
      this.saveUiPrefs();
      this.renderFan();
      this.refreshPinButtons();
    }

    refreshPinButtons() {
      const T = this.T();
      this.moduleList.querySelectorAll('[data-pin]').forEach((button) => {
        const on = this.uiPrefs.pinned.includes(button.dataset.pin);
        button.classList.toggle('pinned', on);
        button.textContent = on ? '✓' : '＋';
        button.title = on ? T.removeTitle : T.addTitle;
      });
    }

    showFanNotice(text) {
      const notice = this.shadow.getElementById('fan-notice');
      notice.textContent = text;
      notice.hidden = false;
      clearTimeout(this._noticeTimer);
      this._noticeTimer = setTimeout(() => this.hideFanNotice(), 2600);
    }

    hideFanNotice() {
      const notice = this.shadow.getElementById('fan-notice');
      if (notice) notice.hidden = true;
    }

    applyModuleFilter() {
      const needle = (this.moduleSearch.value || '').trim().toLowerCase();
      let anyVisible = false;
      this.moduleList.querySelectorAll('.d-grp').forEach((group) => {
        let visible = 0;
        group.querySelectorAll('.d-row').forEach((row) => {
          const hit = !needle || (row.dataset.k || '').includes(needle);
          row.style.display = hit ? '' : 'none';
          if (hit) visible += 1;
        });
        group.style.display = visible ? '' : 'none';
        if (visible) anyVisible = true;
      });
      this.shadow.getElementById('module-nomatch').hidden = !needle || anyVisible;
    }

    setShell(isMainPage) {
      this.isMainPage = Boolean(isMainPage);
      this.shadow.getElementById('back-modules').hidden = !this.isMainPage;
      if (this.isMainPage) {
        this.showModules();
        // 主页面默认收起为右下角圆形启动器，点圆形或「更多」再展开功能表。
        this.setWsVisible(false);
      } else {
        this.showImei();
      }
    }

    setProfileState(preference, detected, effective, detail = '') {
      this.lastProfile = [preference, detected, effective, detail];
      const T = this.T();
      const labels = { sms: T.profileSms, voice: T.profileVoice, unknown: T.profileUnknown };
      const suffix = detail ? T.profileSuffix(detail) : '';
      this.profilePreference.value = preference;
      this.shadow.getElementById('profile-status').textContent = preference === 'auto'
        ? T.profileAuto(labels[detected] || labels.unknown, suffix)
        : T.profileManual(labels[effective] || labels.unknown);
      this.shadow.getElementById('profile-status').dataset.profile = effective;
    }

    setModules(modules) {
      this.modules = Array.isArray(modules) ? modules : [];
      this.renderModuleList();
    }

    /* 功能表按设备真实菜单位置分组（移动/短信/语音/系统设置），组内保持
       注册表顺序；搜索串覆盖中英文名与真实路径。 */
    renderModuleList() {
      const T = this.T();
      this.moduleList.replaceChildren();
      const groupNames = { mobile: T.groupMobile, sms: T.groupSms, voice: T.groupVoice, sys: T.groupSys, other: T.groupOther };
      const groups = new Map();
      this.modules.forEach((module) => {
        const meta = this.moduleMeta(module.id);
        const groupId = meta ? meta.group : 'other';
        if (!groups.has(groupId)) groups.set(groupId, []);
        groups.get(groupId).push(module);
      });
      GROUP_ORDER.filter((groupId) => groups.has(groupId)).forEach((groupId) => {
        const group = document.createElement('div');
        group.className = 'd-grp';
        const header = document.createElement('div');
        header.className = 'd-grp-h';
        const title = document.createElement('span');
        title.textContent = groupNames[groupId];
        const count = document.createElement('span');
        count.className = 'cnt';
        count.textContent = String(groups.get(groupId).length);
        header.append(title, count);
        const body = document.createElement('div');
        body.className = 'd-grp-b';
        groups.get(groupId).forEach((module) => body.appendChild(this.buildModuleRow(module)));
        group.append(header, body);
        this.moduleList.appendChild(group);
      });
      this.refreshPinButtons();
      this.applyModuleFilter();
    }

    buildModuleRow(module) {
      const T = this.T();
      const meta = this.moduleMeta(module.id);
      const tag = this.moduleTag(module.id);
      const name = this.moduleName(module);
      const path = meta ? (meta.path[this.lang] || meta.path.zh) : (module.pages[0] || '');
      const row = document.createElement('div');
      row.className = 'd-row';
      row.dataset.moduleId = module.id;
      row.dataset.k = `${module.name} ${(meta && meta.name.en) || ''} ${(meta && meta.path.zh) || ''} ${(meta && meta.path.en) || ''} ${(meta && meta.label.zh) || ''} ${(meta && meta.label.en) || ''}`.toLowerCase();
      row.classList.toggle('active', module.id === this.activeModuleId);
      const tx = document.createElement('span');
      tx.className = 'tx';
      const strong = document.createElement('strong');
      strong.textContent = name;
      const ds = document.createElement('span');
      ds.className = 'ds';
      const pathSpan = document.createElement('span');
      pathSpan.className = 'path';
      pathSpan.textContent = path;
      ds.appendChild(pathSpan);
      tx.append(strong, ds);
      const tagSpan = document.createElement('span');
      tagSpan.className = `d-tag ${tag.className}`;
      tagSpan.textContent = T[tag.labelKey];
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'd-add';
      pin.dataset.pin = module.id;
      row.append(tx, tagSpan, pin);
      return row;
    }

    showModules(activeId = null, pageModule = null) {
      this.activeModuleId = activeId;
      this.viewName = 'home';
      this.pageModule = pageModule || null;
      this.etmsActive = false;
      this.eimsActive = false;
      this.moduleHome.hidden = false;
      this.imeiWorkspace.hidden = true;
      this.etmsWorkspace.hidden = true;
      this.eimsWorkspace.hidden = true;
      this.renderViewTitle();
      this.renderSubtitle();
      this.renderPageValue();
      this.moduleList.querySelectorAll('[data-module-id]').forEach((row) => {
        row.classList.toggle('active', row.dataset.moduleId === activeId);
      });
      this.clearEtmsPreview();
      this.clearEimsPreview();
      this.clearPreview();
    }

    renderPageValue() {
      const T = this.T();
      this.shadow.getElementById('module-page-value').textContent = this.pageModule
        ? `${this.moduleName(this.pageModule)}${this.pageModule.capability === 'navigation' ? T.navOnlySuffix : ''}`
        : T.selectModule;
    }

    showImei() {
      this.etmsActive = false;
      this.eimsActive = false;
      this.viewName = 'imei';
      this.moduleHome.hidden = true;
      this.imeiWorkspace.hidden = false;
      this.etmsWorkspace.hidden = true;
      this.eimsWorkspace.hidden = true;
      this.renderViewTitle();
      this.renderSubtitle();
      this.setWsVisible(true);
    }

    showEtms() {
      this.etmsActive = true;
      this.eimsActive = false;
      this.viewName = 'etms-registration';
      this.moduleHome.hidden = true;
      this.imeiWorkspace.hidden = true;
      this.etmsWorkspace.hidden = false;
      this.eimsWorkspace.hidden = true;
      this.renderViewTitle();
      this.renderSubtitle();
      this.setWsVisible(true);
    }

    showEims() {
      this.etmsActive = false;
      this.eimsActive = true;
      this.viewName = 'eims-settings';
      this.moduleHome.hidden = true;
      this.imeiWorkspace.hidden = true;
      this.etmsWorkspace.hidden = true;
      this.eimsWorkspace.hidden = false;
      this.renderViewTitle();
      this.renderSubtitle();
      this.setWsVisible(true);
    }

    setPage(mode, controls) {
      this.showImei();
      const previous = this.getSelection();
      const previousBatch = this.getBatchSelection();
      this.mode = mode;
      this.controls = controls;
      this.renderModeValue();
      const ports = [...new Set(controls.map((control) => control.port))];
      const T = this.T();
      this.replaceOptions(this.portSelect, ports, previous.port, (port) => T.portOption(port));
      this.replaceOptions(this.batchStartPort, ports, previousBatch.startPort, (port) => T.portOption(port));
      this.replaceOptions(this.batchEndPort, ports, previousBatch.endPort, (port) => T.portOption(port));
      if (ports.length && !ports.includes(previousBatch.endPort)) this.batchEndPort.value = String(ports[ports.length - 1]);
      const maxSlots = controls.length ? Math.max(...controls.map((control) => control.slot)) : 1;
      this.batchSlotCount.max = String(maxSlots);
      this.batchSlotCount.value = String(Math.min(maxSlots, Math.max(1, previousBatch.slotCount || maxSlots)));
      this.renderSlots(previous.slot);
      this.updateBatchTargetSummary();
      this.clearPreview();
    }

    setEtmsPage(current) {
      this.etmsCurrent = current || null;
      this.showEtms();
      this.updateEtmsCurrent();
      this.clearEtmsPreview();
    }

    updateEtmsCurrent() {
      const T = this.T();
      const labels = { 0: 'NONE', 1: 'ERMS', 2: 'ETMS' };
      const current = this.etmsCurrent;
      const type = current && current.type !== null ? (labels[current.type] || T.typeUnknown(current.type)) : T.typeUnrecognized;
      const status = current && current.status ? current.status : T.statusEmpty;
      this.shadow.getElementById('etms-current-value').textContent = T.regValue(type, status);
      this.shadow.getElementById('etms-current').textContent = current
        ? T.currentEtms(type, current.server || '—', current.port || '—', current.account || '—', status)
        : T.etmsNoForm;
    }

    // 页面自身会异步刷新 ETMS 状态（readErmStatus），工作区只同步显示，
    // 不触碰表单字段、预览或计划，避免覆盖用户输入。
    refreshEtmsCurrent(current) {
      if (!this.etmsActive) return;
      this.etmsCurrent = current || null;
      this.updateEtmsCurrent();
    }

    renderEtmsStepTabs() {
      const T = this.T();
      const container = this.shadow.getElementById('etms-steps');
      container.replaceChildren();
      T.etmsSteps.forEach((_, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'step-tab';
        button.dataset.etmsStep = String(index + 1);
        button.textContent = `${index + 1} ${T.etmsTabLabels[index]}`;
        button.addEventListener('click', () => this.emit('onEtmsStep', index + 1));
        container.appendChild(button);
      });
    }

    setEtmsStep(step) {
      const T = this.T();
      this.etmsStep = Math.max(1, Math.min(T.etmsSteps.length, Number(step) || 1));
      const content = T.etmsSteps[this.etmsStep - 1];
      this.shadow.getElementById('etms-step-count').textContent = T.stepCount(this.etmsStep, T.etmsSteps.length);
      this.shadow.getElementById('etms-step-title').textContent = content[0];
      this.shadow.getElementById('etms-step-description').textContent = content[1];
      this.shadow.getElementById('etms-next-step').textContent = this.etmsStep === T.etmsSteps.length ? T.lastStep : T.nextStep;
      this.shadow.getElementById('etms-next-step').disabled = this.etmsStep === T.etmsSteps.length;
      this.shadow.querySelectorAll('[data-etms-step]').forEach((button) => {
        if (Number(button.dataset.etmsStep) === this.etmsStep) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }

    setEtmsPreview(plan) {
      this.etmsPlan = { ...plan, attempted: false };
      this.fillEtmsPreview(this.etmsPlan);
      this.etmsPreviewSection.hidden = false;
      this.updateEtmsLock();
      this.setEtmsStep(4);
      this.setResult('info', this.T().resultEtmsPreview);
    }

    fillEtmsPreview(plan) {
      const T = this.T();
      this.shadow.getElementById('etms-preview-type').textContent = 'ETMS';
      this.shadow.getElementById('etms-preview-server').textContent = plan.server;
      this.shadow.getElementById('etms-preview-port').textContent = String(plan.port);
      this.shadow.getElementById('etms-preview-account').textContent = plan.account;
      this.shadow.getElementById('etms-preview-password').textContent = T.passwordFilled;
      this.shadow.getElementById('etms-auto-note').textContent = T.etmsAutoNote;
      this.etmsExecuteButton.textContent = plan.attempted ? T.execRetry : T.execEtms;
    }

    clearEtmsPreview() {
      this.etmsPlan = null;
      this.etmsPreviewSection.hidden = true;
      this.etmsExecuteButton.disabled = true;
      this.updateEtmsLock();
    }

    markEtmsAttempted() {
      if (!this.etmsPlan) return;
      this.etmsPlan.attempted = true;
      this.etmsExecuteButton.textContent = this.T().execRetry;
    }

    updateEtmsLock() {
      const locked = Boolean(this.etmsPlan);
      this.etmsPreviewButton.disabled = this.busy || locked;
      this.etmsExecuteButton.disabled = this.busy || !this.etmsPlan;
    }

    setEimsPage(current) {
      this.eimsCurrent = current || null;
      this.showEims();
      this.updateEimsCurrent();
      this.clearEimsPreview();
    }

    updateEimsCurrent() {
      const T = this.T();
      const labels = { 0: 'NONE', 1: 'EIMS', 2: 'EMDA' };
      const protocolLabels = { 0: 'UDP', 1: 'TCP' };
      const current = this.eimsCurrent;
      const type = current && current.type !== null ? (labels[current.type] || T.typeUnknown(current.type)) : T.typeUnrecognized;
      const status = current && current.status ? current.status : T.statusEmpty;
      const protocol = current && current.protocol !== null && current.protocol !== undefined
        ? (protocolLabels[current.protocol] || current.protocol)
        : null;
      this.shadow.getElementById('eims-current-value').textContent = T.regValue(type, status);
      this.shadow.getElementById('eims-current').textContent = current
        ? T.currentEims(type, current.server || '—', protocol, current.username || '—', status)
        : T.eimsNoForm;
    }

    // 与 ETMS 相同：页面状态可能在重启后回到本页时才就绪，工作区只同步显示，
    // 不触碰表单字段、预览或计划。
    refreshEimsCurrent(current) {
      if (!this.eimsActive) return;
      this.eimsCurrent = current || null;
      this.updateEimsCurrent();
    }

    renderEimsStepTabs() {
      const T = this.T();
      const container = this.shadow.getElementById('eims-steps');
      container.replaceChildren();
      T.eimsSteps.forEach((_, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'step-tab';
        button.dataset.eimsStep = String(index + 1);
        button.textContent = `${index + 1} ${T.eimsTabLabels[index]}`;
        button.addEventListener('click', () => this.emit('onEimsStep', index + 1));
        container.appendChild(button);
      });
    }

    setEimsStep(step) {
      const T = this.T();
      this.eimsStep = Math.max(1, Math.min(T.eimsSteps.length, Number(step) || 1));
      const content = T.eimsSteps[this.eimsStep - 1];
      this.shadow.getElementById('eims-step-count').textContent = T.stepCount(this.eimsStep, T.eimsSteps.length);
      this.shadow.getElementById('eims-step-title').textContent = content[0];
      this.shadow.getElementById('eims-step-description').textContent = content[1];
      this.shadow.getElementById('eims-next-step').textContent = this.eimsStep === T.eimsSteps.length ? T.lastStep : T.nextStep;
      this.shadow.getElementById('eims-next-step').disabled = this.eimsStep === T.eimsSteps.length;
      this.shadow.querySelectorAll('[data-eims-step]').forEach((button) => {
        if (Number(button.dataset.eimsStep) === this.eimsStep) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }

    setEimsPreview(plan) {
      this.eimsPlan = { ...plan, attempted: false };
      this.fillEimsPreview(this.eimsPlan);
      this.eimsPreviewSection.hidden = false;
      this.updateEimsLock();
      this.setEimsStep(4);
      this.setResult('info', this.T().resultEimsPreview);
    }

    fillEimsPreview(plan) {
      const T = this.T();
      const protocolLabels = { 0: 'UDP', 1: 'TCP' };
      this.shadow.getElementById('eims-preview-type').textContent = 'EIMS';
      this.shadow.getElementById('eims-preview-server').textContent = plan.server;
      const protocolRow = this.shadow.getElementById('eims-preview-protocol-row');
      if (plan.protocol === null || plan.protocol === undefined) {
        protocolRow.hidden = true;
        this.shadow.getElementById('eims-preview-protocol').textContent = '';
      } else {
        protocolRow.hidden = false;
        this.shadow.getElementById('eims-preview-protocol').textContent = protocolLabels[plan.protocol] || String(plan.protocol);
      }
      this.shadow.getElementById('eims-preview-username').textContent = plan.username;
      this.shadow.getElementById('eims-preview-password').textContent = T.passwordFilled;
      this.shadow.getElementById('eims-auto-note').textContent = T.eimsAutoNote;
      this.eimsExecuteButton.textContent = plan.attempted ? T.execRetry : T.execEims;
    }

    clearEimsPreview() {
      this.eimsPlan = null;
      this.eimsPreviewSection.hidden = true;
      this.eimsExecuteButton.disabled = true;
      this.updateEimsLock();
    }

    markEimsAttempted() {
      if (!this.eimsPlan) return;
      this.eimsPlan.attempted = true;
      this.eimsExecuteButton.textContent = this.T().execRetry;
    }

    updateEimsLock() {
      const locked = Boolean(this.eimsPlan);
      this.eimsPreviewButton.disabled = this.busy || locked;
      this.eimsExecuteButton.disabled = this.busy || !this.eimsPlan;
    }

    replaceOptions(select, values, preferred, label) {
      select.replaceChildren();
      values.forEach((value) => {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = label(value);
        select.appendChild(option);
      });
      if (values.includes(Number(preferred))) select.value = String(preferred);
    }

    renderSlots(preferredSlot) {
      const port = Number(this.portSelect.value);
      const slots = this.controls.filter((control) => control.port === port).map((control) => ({ value: control.slot, label: control.slotLabel }));
      this.slotSelect.replaceChildren();
      const T = this.T();
      slots.forEach((slot) => {
        const option = document.createElement('option');
        option.value = String(slot.value);
        option.textContent = T.slotOption(slot.label);
        this.slotSelect.appendChild(option);
      });
      if (slots.some((slot) => slot.value === Number(preferredSlot))) this.slotSelect.value = String(preferredSlot);
      this.updateCurrentValue();
    }

    getSelection() {
      return { port: Number(this.portSelect.value), slot: Number(this.slotSelect.value), value: this.imeiInput.value.trim() };
    }

    getBatchSelection() {
      return {
        prefix: this.batchPrefix.value.trim(),
        scope: this.batchScope.value,
        startPort: Number(this.batchStartPort.value),
        endPort: Number(this.batchEndPort.value),
        slotCount: Number(this.batchSlotCount.value)
      };
    }

    updateBatchTargetSummary() {
      const T = this.T();
      const selection = this.getBatchSelection();
      const target = this.shadow.getElementById('batch-target');
      if (!selection.startPort || !selection.endPort || !selection.slotCount) {
        target.textContent = T.targetIncomplete;
        return;
      }
      const total = Math.max(0, selection.endPort - selection.startPort + 1) * selection.slotCount;
      target.textContent = T.targetSummary(selection.startPort, selection.endPort, selection.slotCount, total);
    }

    getSelectedControl() {
      const selection = this.getSelection();
      return this.controls.find((control) => control.port === selection.port && control.slot === selection.slot) || null;
    }

    selectTarget(port, slot) {
      if (Array.from(this.portSelect.options).some((option) => Number(option.value) === Number(port))) {
        this.portSelect.value = String(port);
        this.renderSlots(slot);
      }
    }

    updateCurrentValue() {
      const T = this.T();
      const control = this.getSelectedControl();
      this.shadow.getElementById('current-value').textContent = control ? (control.value || T.emptyValue) : T.notFound;
    }

    setWorkflow(workflow) {
      if (!this.T().workflows[workflow]) return;
      this.workflow = workflow;
      this.shadow.querySelectorAll('[data-workflow]').forEach((button) => button.classList.toggle('active', button.dataset.workflow === workflow));
      this.shadow.getElementById('change-form').hidden = workflow !== 'single';
      this.shadow.getElementById('batch-form').hidden = workflow !== 'batch';
      this.clearPreview();
      this.renderStepTabs();
      this.setStep(1);
    }

    renderStepTabs() {
      const T = this.T();
      const container = this.shadow.getElementById('steps');
      container.replaceChildren();
      T.workflows[this.workflow].forEach((_, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'step-tab';
        button.dataset.step = String(index + 1);
        button.textContent = `${index + 1} ${T.stepTabs[this.workflow][index]}`;
        button.addEventListener('click', () => this.emit('onStep', index + 1));
        container.appendChild(button);
      });
    }

    setStep(step) {
      const T = this.T();
      const steps = T.workflows[this.workflow];
      this.step = Math.max(1, Math.min(steps.length, Number(step) || 1));
      const content = steps[this.step - 1];
      this.shadow.getElementById('step-count').textContent = T.stepCount(this.step, steps.length);
      this.shadow.getElementById('step-title').textContent = content[0];
      this.shadow.getElementById('step-description').textContent = content[1];
      this.shadow.getElementById('next-step').textContent = this.step === steps.length ? T.lastStep : T.nextStep;
      this.shadow.getElementById('next-step').disabled = this.step === steps.length;
      this.shadow.querySelectorAll('[data-step]').forEach((button) => {
        if (Number(button.dataset.step) === this.step) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }

    setPreview(plan) {
      this.plan = { ...plan, kind: 'single' };
      this.shadow.getElementById('single-preview').hidden = false;
      this.shadow.getElementById('batch-preview').hidden = true;
      this.fillSinglePreview(this.plan);
      this.previewSection.hidden = false;
      this.executeButton.disabled = this.busy;
      this.setResult('info', this.T().resultPreview);
    }

    fillSinglePreview(plan) {
      const T = this.T();
      this.shadow.getElementById('preview-target').textContent = T.targetLine(plan.port, plan.slotLabel);
      this.shadow.getElementById('preview-before').textContent = plan.previousValue || T.emptyValue;
      this.shadow.getElementById('preview-after').textContent = plan.finalValue;
      const actionNote = plan.autoCompleted ? T.autoAppend : (plan.changed ? T.autoSaved : T.autoUnchanged);
      this.shadow.getElementById('auto-note').textContent = `${actionNote}${T.submitWhole}`;
      this.shadow.getElementById('cancel-preview').textContent = T.cancelPreview;
      this.executeButton.textContent = plan.attempted ? T.execRetry : (plan.changed ? T.execChange : T.execUnchanged);
    }

    setBatchPreview(plan) {
      this.plan = { ...plan, kind: 'batch' };
      this.updateBatchPreparationLock();
      this.shadow.getElementById('single-preview').hidden = true;
      this.shadow.getElementById('batch-preview').hidden = false;
      this.fillBatchPreview(this.plan);
      this.previewSection.hidden = false;
      this.executeButton.disabled = this.busy || !plan.changes.length;
      this.setResult('info', this.T().resultBatchPreview);
      this.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    fillBatchPreview(plan) {
      const T = this.T();
      this.shadow.getElementById('batch-count').textContent = T.batchCount(plan.startPort, plan.endPort, plan.targetCount, plan.changes.length);
      const list = this.shadow.getElementById('batch-list');
      list.replaceChildren();
      plan.changes.forEach((change) => {
        const row = document.createElement('div');
        row.className = 'batch-row';
        row.textContent = `${change.port}.${change.slotLabel}  ${change.previousValue || T.emptyValue} → ${change.finalValue}`;
        list.appendChild(row);
      });
      this.shadow.getElementById('auto-note').textContent = T.batchAutoNote;
      this.shadow.getElementById('cancel-preview').textContent = T.cancelRestore;
      this.executeButton.textContent = plan.attempted ? T.execRetry : T.execBatch(plan.changes.length);
    }

    clearPreview() {
      this.plan = null;
      this.previewSection.hidden = true;
      this.executeButton.disabled = true;
      this.updateBatchPreparationLock();
    }

    markAttempted() {
      if (!this.plan) return;
      this.plan.attempted = true;
      this.executeButton.textContent = this.T().execRetry;
    }

    updateBatchPreparationLock() {
      const locked = Boolean(this.plan && this.plan.kind === 'batch');
      this.batchPrefix.disabled = this.busy || locked;
      this.batchScope.disabled = this.busy || locked;
      this.batchStartPort.disabled = this.busy || locked;
      this.batchEndPort.disabled = this.busy || locked;
      this.batchSlotCount.disabled = this.busy || locked;
      this.batchPrepareButton.disabled = this.busy || locked;
    }

    setBusy(busy) {
      this.busy = busy;
      this.shadow.querySelectorAll('[data-operation]').forEach((control) => { control.disabled = busy; });
      this.previewButton.disabled = busy;
      this.updateBatchPreparationLock();
      this.executeButton.disabled = busy || !this.plan;
      this.updateEtmsLock();
      this.updateEimsLock();
    }

    setResult(status, message) {
      this.resultElement.className = `result ${status}`;
      this.resultElement.textContent = message;
      this.resultElement.hidden = false;
    }

    toggle(show) {
      const shouldShow = typeof show === 'boolean' ? show : this.host.hidden;
      this.host.hidden = !shouldShow;
      if (!shouldShow) this.closeFan();
    }
  }

  root.SkylinePanel = SkylinePanel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
