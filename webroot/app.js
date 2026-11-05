(function () {
  'use strict';

  const CONTROL = '/data/adb/box/scripts/webui.service';
  const state = { status: {}, settings: {}, config: '', busy: false, panelUrl: '' };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function encode(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function decode(value) {
    if (!value) return '';
    try {
      const binary = atob(value);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch (_) {
      return '';
    }
  }

  function parsePairs(text) {
    return String(text || '').split(/\r?\n/).reduce((result, line) => {
      const separator = line.indexOf('=');
      if (separator > 0) result[line.slice(0, separator)] = decode(line.slice(separator + 1));
      return result;
    }, {});
  }

  function command(action, args = []) {
    const safeAction = /^[a-z-]+$/.test(action) ? action : '';
    const safeArgs = args.map((arg) => {
      const value = String(arg);
      if (!/^[A-Za-z0-9+/=,._:-]*$/.test(value)) throw new Error('参数包含不支持的字符');
      return value;
    });
    return `${CONTROL} ${safeAction}${safeArgs.length ? ` ${safeArgs.join(' ')}` : ''}`;
  }

  function exec(commandText) {
    return new Promise((resolve, reject) => {
      if (!window.ksu || typeof window.ksu.exec !== 'function') {
        resolve({ code: 0, stdout: demoResponse(commandText), stderr: '', demo: true });
        return;
      }
      const callbackName = `__boxControlCallback${Date.now()}${Math.floor(Math.random() * 1000)}`;
      window[callbackName] = (code, stdout, stderr) => {
        delete window[callbackName];
        const result = { code: Number(code), stdout: stdout || '', stderr: stderr || '' };
        if (result.code === 0) resolve(result);
        else reject(Object.assign(new Error(result.stderr || result.stdout || `命令执行失败（${result.code}）`), result));
      };
      try {
        window.ksu.exec(commandText, callbackName);
      } catch (error) {
        delete window[callbackName];
        reject(error);
      }
    });
  }

  function demoResponse(commandText) {
    const pairs = (data) => Object.entries(data).map(([key, value]) => `${key}=${encode(value)}`).join('\n');
    if (commandText.endsWith(' status')) return pairs({ running: 'true', pid: '1613', uptime: '03:12:42', core: 'clash', mode: 'tun', version: 'Mihomo v1.19.12', config_path: '/data/adb/box/clash/config.yaml', panel_url: 'http://127.0.0.1:9090/ui/' });
    if (commandText.endsWith(' settings')) return pairs({ bin_name: 'clash', network_mode: 'tun', ipv6: 'false', renew: 'false', update_subscription: 'true', run_crontab: 'false', custom_rules_subs: 'false', subscription_urls: 'https://example.com/subscription' });
    if (commandText.endsWith(' config')) return 'mixed-port: 7890\nallow-lan: true\nmode: rule\nlog-level: info\nexternal-controller: 0.0.0.0:9090\n\ndns:\n  enable: true\n  enhanced-mode: fake-ip\n';
    if (commandText.endsWith(' logs')) return '11:12 am [Info]: clash service is running.\n11:12 am [Info]: clash status: S (sleeping) (PID: 1613)\n11:12 am [Info]: local IP: 192.168.1.20';
    return '演示模式：操作已模拟完成。真机中会通过 KernelSU WebUI 执行。';
  }

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('visible'), 2300);
  }

  function setBusy(busy) {
    state.busy = busy;
    $$('button').forEach((button) => { if (!button.hasAttribute('data-close-sheet')) button.disabled = busy; });
    if (!busy) {
      const running = state.status.running === 'true';
      $('[data-action="start"]').disabled = running;
      $('[data-action="stop"]').disabled = !running;
    }
  }

  function showOperation(title, output = '请稍候…') {
    $('#operationTitle').textContent = title;
    $('#operationOutput').textContent = output;
    $('#operationSheet').classList.add('visible');
    $('#operationSheet').setAttribute('aria-hidden', 'false');
  }

  function closeOperation() {
    $('#operationSheet').classList.remove('visible');
    $('#operationSheet').setAttribute('aria-hidden', 'true');
  }

  function navigate(page) {
    $$('.page').forEach((element) => element.classList.toggle('active', element.dataset.page === page));
    $$('[data-nav]').forEach((button) => button.classList.toggle('active', button.dataset.nav === page));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'config' && !state.config) loadConfig();
    if (page === 'logs') loadLogs();
  }

  async function loadStatus() {
    try {
      const result = await exec(command('status'));
      state.status = parsePairs(result.stdout);
      state.panelUrl = state.status.panel_url || '';
      const running = state.status.running === 'true';
      $('#statusIndicator').className = `status-indicator ${running ? 'running' : 'stopped'}`;
      $('#statusLabel').textContent = running ? '服务运行中' : '服务已停止';
      $('#statusDetail').textContent = state.status.version || (running ? '核心进程工作正常' : '可点击“开启”启动服务');
      $('#coreValue').textContent = state.status.core || '—';
      $('#modeValue').textContent = state.status.mode || '—';
      $('#pidValue').textContent = state.status.pid || '—';
      $('#uptimeValue').textContent = state.status.uptime || '—';
      $('#configPathValue').textContent = state.status.config_path || '—';
      $('[data-action="start"]').disabled = running || state.busy;
      $('[data-action="stop"]').disabled = !running || state.busy;
    } catch (error) {
      $('#statusLabel').textContent = '状态读取失败';
      $('#statusDetail').textContent = error.message;
      $('#statusIndicator').className = 'status-indicator stopped';
      toast('无法读取模块状态');
    }
  }

  async function loadSettings() {
    try {
      const result = await exec(command('settings'));
      state.settings = parsePairs(result.stdout);
      const form = $('#settingsForm');
      ['bin_name', 'network_mode'].forEach((key) => { if (form.elements[key]) form.elements[key].value = state.settings[key] || ''; });
      ['ipv6', 'renew', 'update_subscription', 'run_crontab', 'custom_rules_subs'].forEach((key) => { form.elements[key].checked = state.settings[key] === 'true'; });
      $('#subscriptionUrls').value = state.settings.subscription_urls || '';
      $('#subscriptionStateValue').textContent = state.settings.update_subscription === 'true' ? '已开启' : '已关闭';
      $('#cronStateValue').textContent = state.settings.run_crontab === 'true' ? '已开启' : '已关闭';
    } catch (error) {
      toast(`读取设置失败：${error.message}`);
    }
  }

  function collectSettings() {
    const form = $('#settingsForm');
    const values = {};
    ['bin_name', 'network_mode'].forEach((key) => { values[key] = form.elements[key].value; });
    ['ipv6', 'renew', 'update_subscription', 'run_crontab', 'custom_rules_subs'].forEach((key) => { values[key] = form.elements[key].checked ? 'true' : 'false'; });
    const urls = $('#subscriptionUrls').value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const invalid = urls.find((url) => !/^https?:\/\/\S+$/i.test(url));
    if (invalid) throw new Error(`订阅地址格式不正确：${invalid}`);
    return { values, urls };
  }

  async function saveSettings(restart) {
    let data;
    try { data = collectSettings(); } catch (error) { toast(error.message); return; }
    setBusy(true);
    showOperation(restart ? '保存设置并重启' : '保存设置');
    try {
      for (const [key, value] of Object.entries(data.values)) await exec(command('set', [key, encode(value)]));
      await exec(command('set-subscriptions', [data.urls.map((url) => encode(url)).join(',')]));
      let output = '设置已保存。';
      if (restart) {
        const result = await exec(command('restart'));
        output += `\n\n${result.stdout || '服务已重启。'}`;
      }
      $('#operationOutput').textContent = output;
      toast(restart ? '已保存并重启' : '设置已保存');
      await Promise.all([loadStatus(), loadSettings()]);
    } catch (error) {
      $('#operationOutput').textContent = `操作失败\n\n${error.message}`;
    } finally { setBusy(false); }
  }

  async function runAction(action) {
    const titles = { start: '正在开启服务', stop: '正在关闭服务', restart: '正在重启服务', subscription: '正在更新订阅' };
    setBusy(true);
    showOperation(titles[action] || '正在执行');
    try {
      const result = await exec(command(action));
      $('#operationOutput').textContent = result.stdout || '操作已完成。';
      toast('操作已完成');
      await Promise.all([loadStatus(), loadSettings()]);
    } catch (error) {
      $('#operationOutput').textContent = `操作失败\n\n${error.message}`;
    } finally { setBusy(false); }
  }

  async function loadConfig() {
    $('#configContent').textContent = '正在读取…';
    try {
      const result = await exec(command('config'));
      state.config = result.stdout || '';
      $('#configContent').textContent = state.config || '配置文件为空。';
      $('#configMeta').textContent = `${state.config.split('\n').length} 行 · ${new Blob([state.config]).size} 字节`;
    } catch (error) { $('#configContent').textContent = `读取失败：${error.message}`; }
  }

  async function loadLogs() {
    $('#logsContent').textContent = '正在读取…';
    try {
      const result = await exec(command('logs'));
      $('#logsContent').textContent = result.stdout || '暂无日志。';
    } catch (error) { $('#logsContent').textContent = `读取失败：${error.message}`; }
  }

  async function copyConfig() {
    if (!state.config) return toast('请先读取配置');
    try {
      await navigator.clipboard.writeText(state.config);
      toast('配置已复制');
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = state.config;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      toast('配置已复制');
    }
  }

  function openPanel() {
    if (!state.panelUrl) return toast('未找到 Mihomo 面板地址');
    window.location.href = state.panelUrl;
  }

  $$('[data-nav]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.nav)));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
  $$('[data-action]').forEach((button) => button.addEventListener('click', () => runAction(button.dataset.action)));
  $$('[data-close-sheet]').forEach((element) => element.addEventListener('click', closeOperation));
  $('#refreshButton').addEventListener('click', () => Promise.all([loadStatus(), loadSettings()]));
  $('#settingsForm').addEventListener('submit', (event) => { event.preventDefault(); saveSettings(false); });
  $('#saveRestartButton').addEventListener('click', () => saveSettings(true));
  $('#reloadConfigButton').addEventListener('click', loadConfig);
  $('#copyConfigButton').addEventListener('click', copyConfig);
  $('#reloadLogsButton').addEventListener('click', loadLogs);
  $('#openPanelButton').addEventListener('click', openPanel);
  Promise.all([loadStatus(), loadSettings()]);
}());
