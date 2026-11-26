(function (root) {
  'use strict';

  const MODE_LABELS = {
    0: '指定 IMEI 前缀',
    1: '自定义范围',
    3: '从 ESPS 服务器获取',
    4: '从 ETMS 服务器获取'
  };

  const WORKFLOWS = {
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
  };

  const STEP_TAB_LABELS = {
    single: ['模式', '填写', '提交', '重启'],
    batch: ['模式', '范围', 'Copy', '补全', '提交', '重启']
  };

  const ETMS_STEPS = [
    ['确认 ETMS 区块', '只在“用户及设备管理”的设备网管区块操作。'],
    ['选择 ETMS', '在真实表单把网管类型选为 ETMS；NONE/ERMS 不是本流程。'],
    ['填写注册信息', '直接在右侧真实表单填写服务器、端口、账号和密码。'],
    ['预览并提交', '核对真实表单的非密码字段后，再确认真实 Submit。'],
    ['回读状态', '等待真实状态变为 OK；不打开外部注册链接。']
  ];

  const EIMS_STEPS = [
    ['确认 EIMS 区块', '只在“基本设置”的 EIMS 注册区块操作。'],
    ['选择 EIMS', '在真实表单把服务器类型选为 EIMS；NONE/EMDA 不是本流程。'],
    ['填写注册信息', '直接在右侧真实表单填写服务器地址、UDP/TCP（如有）、用户名和密码。'],
    ['预览并提交', '核对真实表单的非密码字段后，再确认真实 Submit。'],
    ['保存并重启', 'EIMS 注册状态必须保存并重启设备后才会显示；助手只定位真实菜单，不自动重启。'],
    ['回读注册状态', '设备重启完成并回到本页后，等待真实注册状态显示 OK。']
  ];

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

      this.host = document.createElement('div');
      this.host.id = 'skyline-page-assistant-host';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = `
        <style>
          :host {
            all: initial;
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 2147483647;
            width: 380px;
            max-width: calc(100vw - 32px);
            color: #172033;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            font-size: 13px;
            line-height: 1.5;
          }
          :host([hidden]) { display: none; }
          * { box-sizing: border-box; }
          button, input, select { font: inherit; }
          button { cursor: pointer; }
          button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: .58; }
          .panel { overflow: hidden; border: 1px solid #c9d5e6; border-radius: 12px; background: #fff; box-shadow: 0 14px 38px rgba(18,43,76,.24); }
          .header { display: flex; align-items: center; gap: 8px; min-height: 50px; padding: 10px 12px; color: #fff; background: #174a7c; }
          .header-text { flex: 1; min-width: 0; }
          .title { display: block; font-size: 14px; font-weight: 700; }
          .subtitle { display: block; color: #d8eaff; font-size: 11px; }
          .icon-button { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; color: #fff; background: rgba(255,255,255,.12); font-size: 18px; }
          .body { max-height: calc(100vh - 92px); padding: 13px; overflow-y: auto; }
          .body[hidden] { display: none; }
          .page-state { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 10px; padding: 8px 10px; border-radius: 7px; background: #eef5fb; }
          .live { color: #14663b; font-size: 11px; font-weight: 700; }
          .live::before { content: "●"; margin-right: 4px; }
          #mode-value { text-align: right; font-weight: 600; }
          .workflows { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 9px; }
          .workflow-button { padding: 7px; border: 1px solid #bdcadb; border-radius: 6px; color: #40536b; background: #fff; }
          .workflow-button.active { border-color: #175f96; color: #fff; background: #175f96; font-weight: 700; }
          .module-list { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
          .module-button { min-height: 54px; padding: 8px 9px; border: 1px solid #c4d1e0; border-radius: 7px; color: #263d56; background: #fff; text-align: left; }
          .module-button:hover, .module-button.active { border-color: #2d7fb8; background: #eef6fb; }
          .module-button strong, .module-button span { display: block; }
          .module-button strong { font-size: 12px; }
          .module-button span { margin-top: 2px; color: #6a7d91; font-size: 10px; }
          .module-note { margin: 9px 0 0; color: #68798b; font-size: 11px; }
          .profile-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; padding: 7px 9px; border-radius: 6px; background: #f5f8fb; }
          .profile-bar label { display: flex; align-items: center; gap: 6px; color: #536176; font-size: 11px; }
          .profile-bar select { height: 28px; padding: 2px 6px; border: 1px solid #bdcadb; border-radius: 5px; color: #172033; background: #fff; }
          #profile-status { color: #265271; font-size: 11px; font-weight: 600; }
          .back-button { margin-bottom: 8px; }
          .workspace[hidden] { display: none; }
          .steps { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
          .step-tab { flex: 1; min-width: 42px; padding: 5px 3px; border: 1px solid #d5deea; border-radius: 6px; color: #536176; background: #fff; font-size: 11px; }
          .step-tab[aria-current="step"] { border-color: #236ca5; color: #174a7c; background: #eaf4fc; font-weight: 700; }
          .guide { padding: 10px; border-left: 3px solid #2d7fb8; border-radius: 4px; background: #f5f8fb; }
          #step-count { color: #587089; font-size: 11px; font-weight: 700; }
          #step-title { margin: 2px 0 3px; font-size: 14px; }
          #step-description { margin: 0; color: #536176; font-size: 12px; }
          .guide-actions { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; }
          .link-button { padding: 2px 0; border: 0; color: #175f96; background: transparent; font-size: 12px; }
          .form-title { margin: 13px 0 8px; font-size: 13px; }
          .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .field-row.three { grid-template-columns: 1fr 1fr .85fr; gap: 6px; }
          .target-summary { margin: 2px 0 9px; padding: 7px 9px; border-radius: 6px; color: #265271; background: #eef5fb; font-size: 12px; font-weight: 600; }
          .field { display: block; margin-bottom: 8px; color: #536176; font-size: 11px; }
          .field input, .field select { display: block; width: 100%; height: 34px; margin-top: 3px; padding: 5px 8px; border: 1px solid #bdcadb; border-radius: 6px; color: #172033; background: #fff; }
          .field input:focus, .field select:focus { outline: 2px solid #78b9e6; outline-offset: 1px; }
          .current { margin: 2px 0 10px; color: #536176; font-size: 12px; overflow-wrap: anywhere; }
          .notice { margin: 7px 0 10px; padding: 8px; border-radius: 6px; color: #66501d; background: #fff7e5; font-size: 11px; }
          .primary { width: 100%; min-height: 35px; padding: 7px 10px; border: 1px solid #175f96; border-radius: 6px; color: #fff; background: #175f96; font-weight: 650; }
          .secondary { width: 100%; min-height: 32px; margin-top: 6px; padding: 6px 10px; border: 1px solid #a9b8ca; border-radius: 6px; color: #40536b; background: #fff; }
          .preview { margin-top: 11px; padding: 10px; border: 1px solid #e2c278; border-radius: 7px; background: #fff9e9; }
          .preview[hidden], .result[hidden], [hidden] { display: none !important; }
          .preview-title { margin-bottom: 6px; font-weight: 700; }
          .change-line { margin: 3px 0; overflow-wrap: anywhere; }
          .change-line span { display: inline-block; min-width: 52px; color: #6b5b34; }
          .auto-note { margin: 6px 0 9px; color: #745d1c; font-size: 11px; }
          .batch-list { max-height: 160px; margin: 7px 0; overflow-y: auto; border: 1px solid #e5d5aa; border-radius: 5px; background: #fff; }
          .batch-row { padding: 4px 6px; border-bottom: 1px solid #f0e6cf; font-family: Consolas, monospace; font-size: 10px; overflow-wrap: anywhere; }
          .batch-row:last-child { border-bottom: 0; }
          .result { margin-top: 10px; padding: 9px 10px; border-radius: 7px; font-size: 12px; overflow-wrap: anywhere; }
          .result.info { color: #265271; background: #edf5fa; }
          .result.success { color: #14663b; background: #eaf7ef; }
          .result.failure { color: #9c2727; background: #fff0f0; }
          .result.unconfirmed { color: #795510; background: #fff6df; }
          .footer { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 9px; }
          .privacy { margin: 0; color: #718096; font-size: 10px; }
          @media (max-width: 420px) {
            :host { top: 8px; right: 8px; width: calc(100vw - 16px); max-width: none; }
            .body { max-height: calc(100vh - 76px); }
          }
        </style>
        <section class="panel" aria-label="SKYLINE 页面助手">
          <header class="header">
            <div class="header-text"><span class="title">SKYLINE 页面助手</span><span class="subtitle" id="shell-subtitle">全局助手 · 顶层页面模式</span></div>
            <button class="icon-button" id="minimize" type="button" title="收起或展开">−</button>
            <button class="icon-button" id="hide" type="button" title="关闭（点击扩展图标可重新打开）">×</button>
          </header>
          <div class="body" id="assistant-body">
            <section id="module-home">
              <div class="page-state"><span class="live">已连接设备主页面</span><span id="module-page-value">请选择功能</span></div>
              <div class="profile-bar">
                <label>设备类型 <select id="profile-preference" aria-label="设备类型"><option value="auto">自动</option><option value="sms">短信</option><option value="voice">语音</option></select></label>
                <span id="profile-status">自动：识别中</span>
              </div>
              <div class="module-list" id="module-list"></div>
              <p class="module-note">仅 IMEI / ETMS 在确认后代操作；其余入口只导航。</p>
            </section>
            <section class="workspace" id="imei-workspace" hidden>
            <button class="link-button back-button" id="back-modules" type="button">← 功能列表</button>
            <div class="page-state"><span class="live">已连接真实页面</span><span id="mode-value">正在读取…</span></div>
            <div class="workflows">
              <button class="workflow-button" type="button" data-workflow="single">单个修改</button>
              <button class="workflow-button" type="button" data-workflow="batch">批量修改</button>
            </div>
            <nav class="steps" id="steps" aria-label="操作步骤"></nav>
            <section class="guide">
              <span id="step-count"></span><h2 id="step-title"></h2><p id="step-description"></p>
              <div class="guide-actions"><button class="link-button" id="locate" type="button">定位本步</button><button class="link-button" id="next-step" type="button">下一步 →</button></div>
            </section>

            <form id="change-form">
              <h3 class="form-title">修改 IMEI</h3>
              <div class="field-row">
                <label class="field">端口<select id="port-select" data-operation required></select></label>
                <label class="field">槽位<select id="slot-select" data-operation required></select></label>
              </div>
              <div class="current">原值：<strong id="current-value">—</strong></div>
              <label class="field">新 IMEI（14/15 位）<input id="imei-input" data-operation type="text" inputmode="numeric" autocomplete="off" maxlength="15" placeholder="输入完整 IMEI" required></label>
              <button class="primary" id="preview-button" data-operation type="submit">预览</button>
            </form>

            <form id="batch-form" hidden>
              <h3 class="form-title">批量生成</h3>
              <div class="field-row three">
                <label class="field">起始端口<select id="batch-start-port" data-operation></select></label>
                <label class="field">结束端口<select id="batch-end-port" data-operation></select></label>
                <label class="field">每端口<input id="batch-slot-count" data-operation type="number" min="1" step="1" value="32" required></label>
              </div>
              <div class="target-summary" id="batch-target">请选择范围</div>
              <label class="field">IMEI 前 8 位<input id="batch-prefix" data-operation type="text" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="8 位数字" required></label>
              <label class="field">处理方式
                <select id="batch-scope" data-operation>
                  <option value="empty">仅填空白</option>
                  <option value="all">清空所选范围后重建</option>
                </select>
              </label>
              <button class="primary" id="batch-prepare" data-operation type="submit">生成批量预览</button>
            </form>

            <section class="preview" id="preview" hidden>
              <div class="preview-title">核对变更</div>
              <div id="single-preview">
                <div class="change-line"><span>目标</span><strong id="preview-target"></strong></div>
                <div class="change-line"><span>原值</span><strong id="preview-before"></strong></div>
                <div class="change-line"><span>新值</span><strong id="preview-after"></strong></div>
              </div>
              <div id="batch-preview" hidden><div class="change-line" id="batch-count"></div><div class="batch-list" id="batch-list"></div></div>
              <div class="auto-note" id="auto-note"></div>
              <button class="primary" id="execute-button" type="button">确认并修改</button>
              <button class="secondary" id="cancel-preview" type="button">取消预览</button>
            </section>
            </section>
            <section class="workspace" id="etms-workspace" hidden>
            <button class="link-button back-button" id="etms-back-modules" type="button">← 功能列表</button>
            <div class="page-state"><span class="live">已连接 ETMS 页面</span><span id="etms-current-value">正在读取…</span></div>
            <nav class="steps" id="etms-steps" aria-label="ETMS 注册步骤"></nav>
            <section class="guide">
              <span id="etms-step-count"></span><h2 id="etms-step-title"></h2><p id="etms-step-description"></p>
              <div class="guide-actions"><button class="link-button" id="etms-locate" type="button">定位本步</button><button class="link-button" id="etms-next-step" type="button">下一步 →</button></div>
            </section>
            <form id="etms-form">
              <h3 class="form-title">ETMS 注册</h3>
              <div class="current" id="etms-current">当前：正在读取…</div>
              <div class="notice">请直接在右侧真实表单中选择 ETMS 类型，并填写服务器、端口、账号和密码；助手只读取非密码字段，密码只检查是否已填写。没有 ETMS 账号？请先在服务商处注册；助手不会打开外部注册链接。</div>
              <button class="primary" id="etms-preview-button" data-etms-operation type="submit">读取真实表单并预览</button>
            </form>
            <section class="preview" id="etms-preview" hidden>
              <div class="preview-title">核对 ETMS 注册</div>
              <div class="change-line"><span>类型</span><strong id="etms-preview-type"></strong></div>
              <div class="change-line"><span>服务器</span><strong id="etms-preview-server"></strong></div>
              <div class="change-line"><span>端口</span><strong id="etms-preview-port"></strong></div>
              <div class="change-line"><span>账号</span><strong id="etms-preview-account"></strong></div>
              <div class="change-line"><span>密码</span><strong id="etms-preview-password">已填写（不读取、不显示）</strong></div>
              <div class="auto-note" id="etms-auto-note"></div>
              <button class="primary" id="etms-execute-button" type="button">确认并提交</button>
              <button class="secondary" id="etms-cancel-preview" type="button">取消预览</button>
            </section>
            </section>
            <section class="workspace" id="eims-workspace" hidden>
            <button class="link-button back-button" id="eims-back-modules" type="button">← 功能列表</button>
            <div class="page-state"><span class="live">已连接 EIMS 页面</span><span id="eims-current-value">正在读取…</span></div>
            <nav class="steps" id="eims-steps" aria-label="EIMS 注册步骤"></nav>
            <section class="guide">
              <span id="eims-step-count"></span><h2 id="eims-step-title"></h2><p id="eims-step-description"></p>
              <div class="guide-actions"><button class="link-button" id="eims-locate" type="button">定位本步</button><button class="link-button" id="eims-next-step" type="button">下一步 →</button></div>
            </section>
            <form id="eims-form">
              <h3 class="form-title">EIMS 注册</h3>
              <div class="current" id="eims-current">当前：正在读取…</div>
              <div class="notice">请直接在右侧真实表单中选择 EIMS 服务器类型，并填写服务器地址、UDP/TCP（如有）、用户名和密码；助手只读取非密码字段，密码只检查是否已填写。注册状态必须保存并重启设备后才会显示。</div>
              <button class="primary" id="eims-preview-button" data-eims-operation type="submit">读取真实表单并预览</button>
            </form>
            <section class="preview" id="eims-preview" hidden>
              <div class="preview-title">核对 EIMS 注册</div>
              <div class="change-line"><span>类型</span><strong id="eims-preview-type"></strong></div>
              <div class="change-line"><span>服务器</span><strong id="eims-preview-server"></strong></div>
              <div class="change-line" id="eims-preview-protocol-row"><span>UDP/TCP</span><strong id="eims-preview-protocol"></strong></div>
              <div class="change-line"><span>用户名</span><strong id="eims-preview-username"></strong></div>
              <div class="change-line"><span>密码</span><strong id="eims-preview-password">已填写（不读取、不显示）</strong></div>
              <div class="auto-note" id="eims-auto-note"></div>
              <button class="primary" id="eims-execute-button" type="button">确认并提交</button>
              <button class="secondary" id="eims-cancel-preview" type="button">取消预览</button>
            </section>
            </section>
            <div class="result" id="result" role="status" aria-live="polite" hidden></div>
            <div class="footer"><p class="privacy">仅本机处理</p><button class="link-button" id="reboot-guide" type="button">保存 / 重启</button></div>
          </div>
        </section>`;

      (document.body || document.documentElement).appendChild(this.host);
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
      this.profilePreference = this.shadow.getElementById('profile-preference');

      this.shadow.getElementById('minimize').addEventListener('click', () => { this.body.hidden = !this.body.hidden; });
      this.shadow.getElementById('hide').addEventListener('click', () => this.toggle(false));
      this.shadow.getElementById('locate').addEventListener('click', () => this.emit('onStep', this.step));
      this.shadow.getElementById('next-step').addEventListener('click', () => this.emit('onStep', Math.min(WORKFLOWS[this.workflow].length, this.step + 1)));
      this.shadow.getElementById('reboot-guide').addEventListener('click', () => this.emit('onRebootGuide'));
      this.shadow.getElementById('back-modules').addEventListener('click', () => this.emit('onBackModules'));
      this.shadow.getElementById('etms-back-modules').addEventListener('click', () => this.emit('onBackModules'));
      this.shadow.getElementById('etms-locate').addEventListener('click', () => this.emit('onEtmsStep', this.etmsStep));
      this.shadow.getElementById('etms-next-step').addEventListener('click', () => this.emit('onEtmsStep', Math.min(ETMS_STEPS.length, this.etmsStep + 1)));
      this.shadow.getElementById('eims-back-modules').addEventListener('click', () => this.emit('onBackModules'));
      this.shadow.getElementById('eims-locate').addEventListener('click', () => this.emit('onEimsStep', this.eimsStep));
      this.shadow.getElementById('eims-next-step').addEventListener('click', () => this.emit('onEimsStep', Math.min(EIMS_STEPS.length, this.eimsStep + 1)));
      this.profilePreference.addEventListener('change', () => this.emit('onProfileChange', this.profilePreference.value));
      this.moduleList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-module-id]');
        if (button) this.emit('onModuleOpen', button.dataset.moduleId);
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
          this.setResult('unconfirmed', '真实 Submit 已经尝试过，取消预览不能撤销设备修改。请等待状态回读或人工核对真实页面。');
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
          this.setResult('unconfirmed', '真实 Submit 已经尝试过，取消预览不能撤销设备修改。请等待状态回读或人工核对真实页面。');
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
          this.setResult('unconfirmed', '真实 Submit 已经尝试过，取消预览不能撤销设备修改。请等待回读或人工核对真实页面。');
          return;
        }
        if (this.plan.kind === 'batch') this.emit('onBatchCancel', this.plan);
        else this.clearPreview();
      });
      this.renderEtmsStepTabs();
      this.setEtmsStep(1);
      this.renderEimsStepTabs();
      this.setEimsStep(1);
      this.setWorkflow('single');
      this.setShell(false);
    }

    emit(name, value) {
      if (typeof this.callbacks[name] === 'function') this.callbacks[name](value);
    }

    setShell(isMainPage) {
      this.isMainPage = Boolean(isMainPage);
      this.shadow.getElementById('back-modules').hidden = !this.isMainPage;
      if (this.isMainPage) this.showModules();
      else this.showImei();
    }

    setProfileState(preference, detected, effective, detail = '') {
      const labels = { sms: '短信设备', voice: '语音设备', unknown: '未识别' };
      const suffix = detail ? `（${detail}）` : '';
      this.profilePreference.value = preference;
      this.shadow.getElementById('profile-status').textContent = preference === 'auto'
        ? `自动：${labels[detected] || labels.unknown}${suffix}`
        : `手动：${labels[effective] || labels.unknown}`;
      this.shadow.getElementById('profile-status').dataset.profile = effective;
    }

    setModules(modules) {
      this.modules = Array.isArray(modules) ? modules : [];
      this.moduleList.replaceChildren();
      const labels = { operation: '指导 / 代操作', navigation: '仅导航', guide: '仅指导' };
      this.modules.forEach((module) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'module-button';
        button.dataset.moduleId = module.id;
        const name = document.createElement('strong');
        name.textContent = module.name;
        const capability = document.createElement('span');
        capability.textContent = labels[module.capability] || '仅导航';
        button.append(name, capability);
        this.moduleList.appendChild(button);
      });
    }

    showModules(activeId = null, pageModule = null) {
      this.activeModuleId = activeId;
      this.etmsActive = false;
      this.eimsActive = false;
      this.moduleHome.hidden = false;
      this.imeiWorkspace.hidden = true;
      this.etmsWorkspace.hidden = true;
      this.eimsWorkspace.hidden = true;
      this.shadow.getElementById('shell-subtitle').textContent = '全局助手 · 顶层页面模式';
      this.shadow.getElementById('module-page-value').textContent = pageModule
        ? `${pageModule.name}${pageModule.capability === 'navigation' ? ' · 仅导航' : ''}`
        : '请选择功能';
      this.moduleList.querySelectorAll('[data-module-id]').forEach((button) => {
        button.classList.toggle('active', button.dataset.moduleId === activeId);
      });
      this.clearEtmsPreview();
      this.clearEimsPreview();
      this.clearPreview();
    }

    showImei() {
      this.etmsActive = false;
      this.eimsActive = false;
      this.moduleHome.hidden = true;
      this.imeiWorkspace.hidden = false;
      this.etmsWorkspace.hidden = true;
      this.eimsWorkspace.hidden = true;
      this.shadow.getElementById('shell-subtitle').textContent = this.isMainPage
        ? 'IMEI 设置 · 顶层页面模式'
        : 'IMEI 设置 · 功能页模式';
    }

    showEtms() {
      this.etmsActive = true;
      this.eimsActive = false;
      this.moduleHome.hidden = true;
      this.imeiWorkspace.hidden = true;
      this.etmsWorkspace.hidden = false;
      this.eimsWorkspace.hidden = true;
      this.shadow.getElementById('shell-subtitle').textContent = this.isMainPage
        ? 'ETMS 注册 · 顶层页面模式'
        : 'ETMS 注册 · 功能页模式';
    }

    showEims() {
      this.etmsActive = false;
      this.eimsActive = true;
      this.moduleHome.hidden = true;
      this.imeiWorkspace.hidden = true;
      this.etmsWorkspace.hidden = true;
      this.eimsWorkspace.hidden = false;
      this.shadow.getElementById('shell-subtitle').textContent = this.isMainPage
        ? 'EIMS 注册 · 顶层页面模式'
        : 'EIMS 注册 · 功能页模式';
    }

    setPage(mode, controls) {
      this.showImei();
      const previous = this.getSelection();
      const previousBatch = this.getBatchSelection();
      this.mode = mode;
      this.controls = controls;
      this.shadow.getElementById('mode-value').textContent = MODE_LABELS[mode] || `未知模式 (${mode})`;
      const ports = [...new Set(controls.map((control) => control.port))];
      this.replaceOptions(this.portSelect, ports, previous.port, (port) => `端口 ${port}`);
      this.replaceOptions(this.batchStartPort, ports, previousBatch.startPort, (port) => `端口 ${port}`);
      this.replaceOptions(this.batchEndPort, ports, previousBatch.endPort, (port) => `端口 ${port}`);
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
      const labels = { 0: 'NONE', 1: 'ERMS', 2: 'ETMS' };
      const current = this.etmsCurrent;
      const type = current && current.type !== null ? (labels[current.type] || `未知 (${current.type})`) : '未识别';
      const status = current && current.status ? current.status : '空';
      this.shadow.getElementById('etms-current-value').textContent = `${type} · 状态 ${status}`;
      this.shadow.getElementById('etms-current').textContent = current
        ? `当前：${type} · ${current.server || '—'}:${current.port || '—'} · ${current.account || '—'} · 状态 ${status}`
        : '当前：未读取到 ETMS 设备网管表单';
    }

    // 页面自身会异步刷新 ETMS 状态（readErmStatus 轮询），工作区只同步显示，
    // 不触碰表单字段、预览或计划，避免覆盖用户输入。
    refreshEtmsCurrent(current) {
      if (!this.etmsActive) return;
      this.etmsCurrent = current || null;
      this.updateEtmsCurrent();
    }

    renderEtmsStepTabs() {
      const container = this.shadow.getElementById('etms-steps');
      container.replaceChildren();
      ETMS_STEPS.forEach((_, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'step-tab';
        button.dataset.etmsStep = String(index + 1);
        button.textContent = `${index + 1} ${['区块', '类型', '填写', '提交', '状态'][index]}`;
        button.addEventListener('click', () => this.emit('onEtmsStep', index + 1));
        container.appendChild(button);
      });
    }

    setEtmsStep(step) {
      this.etmsStep = Math.max(1, Math.min(ETMS_STEPS.length, Number(step) || 1));
      const content = ETMS_STEPS[this.etmsStep - 1];
      this.shadow.getElementById('etms-step-count').textContent = `第 ${this.etmsStep} 步，共 ${ETMS_STEPS.length} 步`;
      this.shadow.getElementById('etms-step-title').textContent = content[0];
      this.shadow.getElementById('etms-step-description').textContent = content[1];
      this.shadow.getElementById('etms-next-step').textContent = this.etmsStep === ETMS_STEPS.length ? '已到最后一步' : '下一步 →';
      this.shadow.getElementById('etms-next-step').disabled = this.etmsStep === ETMS_STEPS.length;
      this.shadow.querySelectorAll('[data-etms-step]').forEach((button) => {
        if (Number(button.dataset.etmsStep) === this.etmsStep) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }

    setEtmsPreview(plan) {
      this.etmsPlan = { ...plan, attempted: false };
      this.shadow.getElementById('etms-preview-type').textContent = 'ETMS';
      this.shadow.getElementById('etms-preview-server').textContent = plan.server;
      this.shadow.getElementById('etms-preview-port').textContent = String(plan.port);
      this.shadow.getElementById('etms-preview-account').textContent = plan.account;
      this.shadow.getElementById('etms-auto-note').textContent = '将按右侧真实表单的当前值提交；密码只确认已填写，不读取、不显示、不保存。';
      this.etmsPreviewSection.hidden = false;
      this.etmsExecuteButton.textContent = '确认并提交 ETMS 注册';
      this.updateEtmsLock();
      this.setEtmsStep(4);
      this.setResult('info', 'ETMS 预览尚未提交。');
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
      this.etmsExecuteButton.textContent = '再次尝试 Submit（上次结果未确认）';
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
      const labels = { 0: 'NONE', 1: 'EIMS', 2: 'EMDA' };
      const protocolLabels = { 0: 'UDP', 1: 'TCP' };
      const current = this.eimsCurrent;
      const type = current && current.type !== null ? (labels[current.type] || `未知 (${current.type})`) : '未识别';
      const status = current && current.status ? current.status : '空';
      const protocol = current && current.protocol !== null && current.protocol !== undefined
        ? (protocolLabels[current.protocol] || current.protocol)
        : null;
      this.shadow.getElementById('eims-current-value').textContent = `${type} · 状态 ${status}`;
      this.shadow.getElementById('eims-current').textContent = current
        ? `当前：${type} · ${current.server || '—'}${protocol ? ` · ${protocol}` : ''} · ${current.username || '—'} · 状态 ${status}`
        : '当前：未读取到 EIMS 注册表单';
    }

    // 与 ETMS 相同：页面状态可能在重启后回到本页时才就绪，工作区只同步显示，
    // 不触碰表单字段、预览或计划。
    refreshEimsCurrent(current) {
      if (!this.eimsActive) return;
      this.eimsCurrent = current || null;
      this.updateEimsCurrent();
    }

    renderEimsStepTabs() {
      const container = this.shadow.getElementById('eims-steps');
      container.replaceChildren();
      EIMS_STEPS.forEach((_, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'step-tab';
        button.dataset.eimsStep = String(index + 1);
        button.textContent = `${index + 1} ${['区块', '类型', '填写', '提交', '重启', '状态'][index]}`;
        button.addEventListener('click', () => this.emit('onEimsStep', index + 1));
        container.appendChild(button);
      });
    }

    setEimsStep(step) {
      this.eimsStep = Math.max(1, Math.min(EIMS_STEPS.length, Number(step) || 1));
      const content = EIMS_STEPS[this.eimsStep - 1];
      this.shadow.getElementById('eims-step-count').textContent = `第 ${this.eimsStep} 步，共 ${EIMS_STEPS.length} 步`;
      this.shadow.getElementById('eims-step-title').textContent = content[0];
      this.shadow.getElementById('eims-step-description').textContent = content[1];
      this.shadow.getElementById('eims-next-step').textContent = this.eimsStep === EIMS_STEPS.length ? '已到最后一步' : '下一步 →';
      this.shadow.getElementById('eims-next-step').disabled = this.eimsStep === EIMS_STEPS.length;
      this.shadow.querySelectorAll('[data-eims-step]').forEach((button) => {
        if (Number(button.dataset.eimsStep) === this.eimsStep) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }

    setEimsPreview(plan) {
      const protocolLabels = { 0: 'UDP', 1: 'TCP' };
      this.eimsPlan = { ...plan, attempted: false };
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
      this.shadow.getElementById('eims-auto-note').textContent = '将按右侧真实表单的当前值提交；密码只确认已填写，不读取、不显示、不保存。提交后必须保存并重启设备，注册状态才会显示。';
      this.eimsPreviewSection.hidden = false;
      this.eimsExecuteButton.textContent = '确认并提交 EIMS 注册';
      this.updateEimsLock();
      this.setEimsStep(4);
      this.setResult('info', 'EIMS 预览尚未提交。');
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
      this.eimsExecuteButton.textContent = '再次尝试 Submit（上次结果未确认）';
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
      slots.forEach((slot) => {
        const option = document.createElement('option');
        option.value = String(slot.value);
        option.textContent = `槽位 ${slot.label}`;
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
      const selection = this.getBatchSelection();
      const target = this.shadow.getElementById('batch-target');
      if (!selection.startPort || !selection.endPort || !selection.slotCount) {
        target.textContent = '请选择完整范围';
        return;
      }
      const total = Math.max(0, selection.endPort - selection.startPort + 1) * selection.slotCount;
      target.textContent = `端口 ${selection.startPort}–${selection.endPort} · 每端口 ${selection.slotCount} 个 · 共 ${total} 个`;
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
      const control = this.getSelectedControl();
      this.shadow.getElementById('current-value').textContent = control ? (control.value || '（空）') : '未找到';
    }

    setWorkflow(workflow) {
      if (!WORKFLOWS[workflow]) return;
      this.workflow = workflow;
      this.shadow.querySelectorAll('[data-workflow]').forEach((button) => button.classList.toggle('active', button.dataset.workflow === workflow));
      this.shadow.getElementById('change-form').hidden = workflow !== 'single';
      this.shadow.getElementById('batch-form').hidden = workflow !== 'batch';
      this.clearPreview();
      this.renderStepTabs();
      this.setStep(1);
    }

    renderStepTabs() {
      const container = this.shadow.getElementById('steps');
      container.replaceChildren();
      WORKFLOWS[this.workflow].forEach((_, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'step-tab';
        button.dataset.step = String(index + 1);
        button.textContent = `${index + 1} ${STEP_TAB_LABELS[this.workflow][index]}`;
        button.addEventListener('click', () => this.emit('onStep', index + 1));
        container.appendChild(button);
      });
    }

    setStep(step) {
      const steps = WORKFLOWS[this.workflow];
      this.step = Math.max(1, Math.min(steps.length, Number(step) || 1));
      const content = steps[this.step - 1];
      this.shadow.getElementById('step-count').textContent = `第 ${this.step} 步，共 ${steps.length} 步`;
      this.shadow.getElementById('step-title').textContent = content[0];
      this.shadow.getElementById('step-description').textContent = content[1];
      this.shadow.getElementById('next-step').textContent = this.step === steps.length ? '已到最后一步' : '下一步 →';
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
      this.shadow.getElementById('preview-target').textContent = `端口 ${plan.port} / 槽位 ${plan.slotLabel}`;
      this.shadow.getElementById('preview-before').textContent = plan.previousValue || '（空）';
      this.shadow.getElementById('preview-after').textContent = plan.finalValue;
      const actionNote = plan.autoCompleted ? '设备将追加第 15 位。' : (plan.changed ? '由真实 Submit 保存。' : '值未变化。');
      this.shadow.getElementById('auto-note').textContent = `${actionNote} Submit 会保存整张表。`;
      this.shadow.getElementById('cancel-preview').textContent = '取消预览';
      this.executeButton.textContent = plan.changed ? '确认并修改' : '值未变化，仍提交';
      this.previewSection.hidden = false;
      this.executeButton.disabled = this.busy;
      this.setResult('info', '预览尚未提交。');
    }

    setBatchPreview(plan) {
      this.plan = { ...plan, kind: 'batch' };
      this.updateBatchPreparationLock();
      this.shadow.getElementById('single-preview').hidden = true;
      this.shadow.getElementById('batch-preview').hidden = false;
      this.shadow.getElementById('batch-count').textContent = `端口 ${plan.startPort}–${plan.endPort} · 目标 ${plan.targetCount} 个 · 实际变更 ${plan.changes.length} 个`;
      const list = this.shadow.getElementById('batch-list');
      list.replaceChildren();
      plan.changes.forEach((change) => {
        const row = document.createElement('div');
        row.className = 'batch-row';
        row.textContent = `${change.port}.${change.slotLabel}  ${change.previousValue || '（空）'} → ${change.finalValue}`;
        list.appendChild(row);
      });
      this.shadow.getElementById('auto-note').textContent = '由真实按钮生成；Submit 会保存整张表。';
      this.shadow.getElementById('cancel-preview').textContent = '取消并恢复';
      this.executeButton.textContent = `确认提交 ${plan.changes.length} 项变更`;
      this.previewSection.hidden = false;
      this.executeButton.disabled = this.busy || !plan.changes.length;
      this.setResult('info', '预览未保存，可取消恢复。');
      this.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      this.executeButton.textContent = '再次尝试 Submit（上次结果未确认）';
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
    }
  }

  root.SkylinePanel = SkylinePanel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
