(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkylineImei = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const INPUT_NAME = /^goip_imei\((\d+)(?:\.(\d{1,2})|([A-Z]))\)$/;

  function parseImeiInputName(name) {
    const match = INPUT_NAME.exec(name || '');
    if (!match) return null;
    const port = Number(match[1]);
    const slot = match[2] === undefined
      ? match[3].charCodeAt(0) - 64
      : Number(match[2]);
    if (port < 1 || slot < 1) return null;
    return {
      port,
      slot,
      slotLabel: match[2] === undefined ? match[3] : match[2].padStart(2, '0')
    };
  }

  function getMode(doc) {
    const radios = Array.from(doc.querySelectorAll('input[name="imeiDisplayType"]'));
    const checked = radios.find((radio) => radio.checked);
    return checked ? Number(checked.value) : null;
  }

  function collectImeiControls(doc) {
    return Array.from(doc.querySelectorAll('input[name^="goip_imei("]'))
      .map((element) => {
        const target = parseImeiInputName(element.name);
        if (!target) return null;
        return {
          ...target,
          name: element.name,
          value: element.value.trim(),
          disabled: Boolean(element.disabled),
          element
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.port - b.port || a.slot - b.slot);
  }

  function findControl(controls, port, slot) {
    return controls.find((control) => (
      control.port === Number(port) && control.slot === Number(slot)
    )) || null;
  }

  function findBatchButton(doc, action) {
    const handlers = {
      Copy: 'copyImei',
      Clear: 'clearImei',
      AutoComplete: 'completeImeis'
    };
    const handler = handlers[action];
    if (!handler) return null;
    return doc.querySelector(`#ID_SpanCopyImei input[type="button"][onclick*="${handler}("]`);
  }

  function selectBatchControls(controls, startPort, endPort, slotCount) {
    const start = Number(startPort);
    const end = Number(endPort);
    const count = Number(slotCount);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      throw new Error('请选择有效的起止端口。');
    }
    if (!Number.isInteger(count) || count < 1) {
      throw new Error('每端口数量必须是大于 0 的整数。');
    }
    const selected = [];
    for (let port = start; port <= end; port += 1) {
      for (let slot = 1; slot <= count; slot += 1) {
        const control = findControl(controls, port, slot);
        if (!control) throw new Error(`真实页面不存在端口 ${port} / 槽位 ${slot}。`);
        if (control.disabled) throw new Error(`端口 ${port} / 槽位 ${control.slotLabel} 当前不可编辑。`);
        selected.push(control);
      }
    }
    return selected;
  }

  function imeiCheckDigit(firstFourteen) {
    if (!/^\d{14}$/.test(firstFourteen)) {
      throw new Error('IMEI 校验位只能根据 14 位数字计算。');
    }
    let sum = 0;
    for (let index = 0; index < 14; index += 2) {
      sum += Number(firstFourteen.charAt(index));
    }
    for (let index = 1; index < 14; index += 2) {
      const doubled = Number(firstFourteen.charAt(index)) * 2;
      sum += doubled < 10 ? doubled : (doubled % 10) + 1;
    }
    return String((10 - (sum % 10)) % 10);
  }

  function normalizeImei(rawValue) {
    const value = String(rawValue || '').trim();
    if (!/^\d+$/.test(value)) {
      throw new Error('IMEI 只能包含数字。');
    }
    if (value.length === 14) {
      return {
        enteredValue: value,
        finalValue: value + imeiCheckDigit(value),
        autoCompleted: true
      };
    }
    if (value.length === 15) {
      const expected = imeiCheckDigit(value.slice(0, 14));
      if (value.charAt(14) !== expected) {
        throw new Error(`IMEI 校验位不正确，第 15 位应为 ${expected}。`);
      }
      return { enteredValue: value, finalValue: value, autoCompleted: false };
    }
    throw new Error('请输入完整的 14 位或 15 位 IMEI。');
  }

  function createChangePlan(mode, control, rawValue) {
    if (mode !== 0) {
      throw new Error('当前不是“指定 IMEI 前缀”模式，请先按第 1 步切换模式。');
    }
    if (!control) throw new Error('真实页面中找不到目标端口和槽位。');
    if (control.disabled) {
      throw new Error('目标输入框当前被页面禁用，不能代为修改。');
    }
    const normalized = normalizeImei(rawValue);
    return {
      port: control.port,
      slot: control.slot,
      slotLabel: control.slotLabel,
      inputName: control.name,
      previousValue: control.value,
      ...normalized,
      changed: control.value !== normalized.finalValue
    };
  }

  function evaluateReadback(pending, control) {
    if (!control) {
      return {
        status: 'unconfirmed',
        message: '提交后未在真实页面找到原输入框，无法确认结果。'
      };
    }
    if (control.value === pending.finalValue) {
      return {
        status: 'success',
        message: `回读一致：端口 ${pending.port} / 槽位 ${pending.slotLabel} 已为 ${pending.finalValue}。`
      };
    }
    return {
      status: 'failure',
      message: `回读不一致：预期 ${pending.finalValue}，页面当前为 ${control.value || '（空）'}。原值是 ${pending.previousValue || '（空）'}。`
    };
  }

  function normalizeBatchPrefix(rawValue) {
    const prefix = String(rawValue || '').trim();
    if (!/^\d{8}$/.test(prefix)) throw new Error('批量前缀必须是 8 位数字。');
    return prefix;
  }

  function buildBatchChanges(beforeControls, afterControls) {
    const beforeByName = new Map(beforeControls.map((control) => [control.name, control]));
    return afterControls
      .filter((control) => {
        const before = beforeByName.get(control.name);
        return before && before.value !== control.value;
      })
      .map((control) => {
        const before = beforeByName.get(control.name);
        return {
          inputName: control.name,
          port: control.port,
          slot: control.slot,
          slotLabel: control.slotLabel,
          previousValue: before.value,
          finalValue: control.value
        };
      });
  }

  function evaluateBatchReadback(pending, controls) {
    const byName = new Map(controls.map((control) => [control.name, control]));
    const missing = [];
    const mismatched = [];
    let matched = 0;
    pending.changes.forEach((change) => {
      const control = byName.get(change.inputName);
      if (!control) missing.push(change);
      else if (control.value === change.finalValue) matched += 1;
      else mismatched.push({ change, actualValue: control.value });
    });
    if (missing.length) {
      return {
        status: 'unconfirmed',
        matched,
        missing,
        mismatched,
        message: `回读时有 ${missing.length} 个目标输入框未找到，另有 ${mismatched.length} 项不一致，无法确认完整结果。`
      };
    }
    if (mismatched.length) {
      return {
        status: 'failure',
        matched,
        missing,
        mismatched,
        message: `回读尚未一致：${matched} 项符合预期，${mismatched.length} 项不一致。设备可能存在延迟。`
      };
    }
    return {
      status: 'success',
      matched,
      missing,
      mismatched,
      message: `全部回读一致：${matched} 项 IMEI 与提交前预览相符。建议最后检查 Save and Reboot。`
    };
  }

  function isSupportedPage(locationLike, doc) {
    return /^\/goip_imei_(?:en|cn)\.html$/.test(locationLike.pathname)
      && Boolean(doc.querySelector('#imeiTypeFormID'))
      && Boolean(doc.querySelector('#ID_TabImeiList'));
  }

  return {
    buildBatchChanges,
    collectImeiControls,
    createChangePlan,
    evaluateBatchReadback,
    evaluateReadback,
    findBatchButton,
    findControl,
    getMode,
    imeiCheckDigit,
    isSupportedPage,
    normalizeBatchPrefix,
    normalizeImei,
    parseImeiInputName,
    selectBatchControls
  };
});
