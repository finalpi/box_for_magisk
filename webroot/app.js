(function () {
  'use strict';

  const CONTROL = '/data/adb/box/scripts/webui.service';
  const previewMode = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  const state = {
    status: {}, settings: {}, kernel: {}, config: '', busy: false, panelUrl: '',
    traffic: { rx: 0, tx: 0, time: 0, loading: false, downHistory: [], upHistory: [] },
    latencyLoading: false
  };
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
        if (previewMode) resolve({ code: 0, stdout: demoResponse(commandText), stderr: '', demo: true });
        else reject(new Error('KernelSU WebUI bridge unavailable'));
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

  function spawn(action, onData) {
    if (!window.ksu || typeof window.ksu.spawn !== 'function') return exec(command(action));
    return new Promise((resolve, reject) => {
      const callbackName = `__boxControlProcess${Date.now()}${Math.floor(Math.random() * 1000)}`;
      let stdout = '';
      let stderr = '';
      const append = (type, data) => {
        const line = `${data || ''}\n`;
        if (type === 'stdout') stdout += line;
        else stderr += line;
        if (onData) onData(stdout, stderr);
      };
      window[callbackName] = {
        stdout: { emit: (event, data) => { if (event === 'data') append('stdout', data); } },
        stderr: { emit: (event, data) => { if (event === 'data') append('stderr', data); } },
        emit: (event, data) => {
          if (event !== 'exit') return;
          delete window[callbackName];
          const code = Number(data);
          const result = { code, stdout: stdout.trim(), stderr: stderr.trim() };
          if (code === 0) resolve(result);
          else reject(Object.assign(new Error(result.stderr || result.stdout || `命令执行失败（${code}）`), result));
        }
      };
      try {
        window.ksu.spawn(CONTROL, JSON.stringify([action]), null, callbackName);
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
    if (commandText.endsWith(' traffic')) {
      const tick = Math.floor(Date.now() / 1000);
      return pairs({ interface: 'tun0', rx_bytes: String(812345678 + tick * 124000), tx_bytes: String(186543210 + tick * 39000) });
    }
    if (commandText.endsWith(' latency')) return pairs({ baidu: '163', google: '286', youtube: '412' });
    if (commandText.endsWith(' kernel-info')) return pairs({ current: 'v1.19.12', latest: 'v1.19.33', update_available: 'true' });
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
      $('#refreshLatencyButton').disabled = state.latencyLoading;
      $('#updateKernelButton').disabled = !state.kernel.latest || state.kernel.latest === 'unavailable';
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
    if (page === 'mihomo') loadPanel(false);
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
      const currentKernel = (state.status.version || '').match(/v[0-9]+\.[0-9]+\.[0-9]+/);
      if (currentKernel) {
        state.kernel.current = currentKernel[0];
        renderKernelInfo();
      }
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
      const count = (state.settings.subscription_urls || '').split(/\r?\n/).filter(Boolean).length;
      $('#subscriptionSource').innerHTML = `已从 <code>/data/adb/box/settings.ini</code> 读取 ${count} 个地址，页面不会向外发送。`;
      $('#subscriptionStateValue').textContent = state.settings.update_subscription === 'true' ? '已开启' : '已关闭';
      $('#cronStateValue').textContent = state.settings.run_crontab === 'true' ? '已开启' : '已关闭';
    } catch (error) {
      toast(`读取设置失败：${error.message}`);
    }
  }

  function formatSpeed(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value.toFixed(0)} B/s`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB/s`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB/s`;
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB/s`;
  }

  function drawSpeedChart() {
    const canvas = $('#speedChart');
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(280, canvas.clientWidth);
    const height = 150;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);

    const down = state.traffic.downHistory;
    const up = state.traffic.upHistory;
    const max = Math.max(1024, ...down, ...up) * 1.12;
    const styles = getComputedStyle(document.documentElement);
    const drawLine = (values, color, fill) => {
      if (!values.length) return;
      context.beginPath();
      values.forEach((value, index) => {
        const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
        const y = height - 10 - ((value / max) * (height - 24));
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.lineWidth = 2.5;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.strokeStyle = color;
      context.stroke();
      if (fill) {
        context.lineTo(width, height);
        context.lineTo(0, height);
        context.closePath();
        const gradient = context.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, `${color}38`);
        gradient.addColorStop(1, `${color}00`);
        context.fillStyle = gradient;
        context.fill();
      }
    };
    drawLine(down, styles.getPropertyValue('--primary').trim(), true);
    drawLine(up, styles.getPropertyValue('--upload').trim(), false);
  }

  async function loadTraffic() {
    if (state.traffic.loading || document.hidden) return;
    state.traffic.loading = true;
    try {
      const result = await exec(command('traffic'));
      const traffic = parsePairs(result.stdout);
      const now = Date.now();
      const rx = Number(traffic.rx_bytes);
      const tx = Number(traffic.tx_bytes);
      let down = 0;
      let up = 0;
      if (state.traffic.time && rx >= state.traffic.rx && tx >= state.traffic.tx) {
        const seconds = Math.max(.25, (now - state.traffic.time) / 1000);
        down = (rx - state.traffic.rx) / seconds;
        up = (tx - state.traffic.tx) / seconds;
      }
      state.traffic.rx = rx;
      state.traffic.tx = tx;
      state.traffic.time = now;
      state.traffic.downHistory.push(down);
      state.traffic.upHistory.push(up);
      state.traffic.downHistory = state.traffic.downHistory.slice(-30);
      state.traffic.upHistory = state.traffic.upHistory.slice(-30);
      $('#downloadSpeed').textContent = formatSpeed(down);
      $('#uploadSpeed').textContent = formatSpeed(up);
      $('#networkInterface').textContent = traffic.interface ? `接口 ${traffic.interface}` : '接口未知';
      drawSpeedChart();
    } catch (error) {
      $('#networkInterface').textContent = '读取失败';
    } finally { state.traffic.loading = false; }
  }

  function renderLatency(element, value) {
    const numeric = Number(value);
    element.className = '';
    if (!Number.isFinite(numeric)) {
      element.textContent = value === 'unavailable' ? '无 curl' : '超时';
      element.classList.add('bad');
      return;
    }
    element.textContent = `${numeric} ms`;
    element.classList.add(numeric < 300 ? 'good' : numeric < 800 ? 'slow' : 'bad');
  }

  async function loadLatency() {
    if (state.latencyLoading || document.hidden) return;
    state.latencyLoading = true;
    $('#refreshLatencyButton').disabled = true;
    $('#latencyUpdated').textContent = '正在通过 HTTPS 检测…';
    try {
      const result = await spawn('latency');
      const latency = parsePairs(result.stdout);
      renderLatency($('#baiduLatency'), latency.baidu);
      renderLatency($('#googleLatency'), latency.google);
      renderLatency($('#youtubeLatency'), latency.youtube);
      $('#latencyUpdated').textContent = `最近检测：${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · 每 30 秒刷新`;
    } catch (error) {
      $('#latencyUpdated').textContent = `检测失败：${error.message}`;
    } finally {
      state.latencyLoading = false;
      if (!state.busy) $('#refreshLatencyButton').disabled = false;
    }
  }

  function renderKernelInfo() {
    const currentVersion = state.kernel.current || 'not-installed';
    const latestVersion = state.kernel.latest || '';
    $('#currentKernelVersion').textContent = currentVersion === 'not-installed' ? '未安装' : currentVersion;
    $('#latestKernelVersion').textContent = latestVersion === 'unavailable' ? '查询失败' : latestVersion || '正在查询';
    if (!latestVersion) {
      $('#kernelState').textContent = '本地已读取';
      $('#kernelState').className = 'kernel-state current';
      $('#updateKernelButton').textContent = '正在查询最新稳定版';
      $('#updateKernelButton').disabled = true;
      return;
    }
    const available = currentVersion !== 'not-installed' && latestVersion !== 'unavailable' && currentVersion !== latestVersion;
    const current = currentVersion !== 'not-installed' && currentVersion === latestVersion;
    $('#kernelState').textContent = available ? '发现更新' : current ? '已是最新' : '暂时无法比较';
    $('#kernelState').className = `kernel-state ${available ? 'available' : current ? 'current' : ''}`;
    $('#updateKernelButton').textContent = available ? `更新到 ${latestVersion}` : current ? '重新安装最新稳定版' : '重新检查版本';
    $('#updateKernelButton').disabled = state.busy || latestVersion === 'unavailable';
  }

  function restoreCachedKernelInfo() {
    try {
      const cached = JSON.parse(localStorage.getItem('box.kernel.latest') || 'null');
      if (cached && /^v[0-9]+\.[0-9]+\.[0-9]+$/.test(cached.version) && Date.now() - cached.time < 86400000) {
        state.kernel.latest = cached.version;
      }
    } catch (_) { /* Ignore invalid or unavailable WebView storage. */ }
    renderKernelInfo();
  }

  async function loadKernelInfo() {
    $('#kernelState').textContent = '正在检查';
    $('#kernelState').className = 'kernel-state';
    try {
      const result = await spawn('kernel-info');
      state.kernel = { ...state.kernel, ...parsePairs(result.stdout) };
      if (state.kernel.latest && state.kernel.latest !== 'unavailable') {
        try { localStorage.setItem('box.kernel.latest', JSON.stringify({ version: state.kernel.latest, time: Date.now() })); } catch (_) { /* Storage can be disabled. */ }
      }
      renderKernelInfo();
    } catch (error) {
      $('#kernelState').textContent = '检查失败';
      if (!state.kernel.latest) $('#latestKernelVersion').textContent = '—';
      $('#updateKernelButton').textContent = '重新检查版本';
    }
  }

  async function updateKernel() {
    if (state.kernel.latest === 'unavailable') return loadKernelInfo();
    const target = state.kernel.latest || '最新稳定版';
    if (!window.confirm(`将下载并安装 Mihomo ${target}。运行中的 Clash 服务会自动重启，是否继续？`)) return;
    setBusy(true);
    showOperation(`正在更新 Mihomo ${target}`, '正在连接 GitHub Release…');
    try {
      const result = await spawn('update-kernel', (stdout, stderr) => {
        $('#operationOutput').textContent = [stdout, stderr].filter(Boolean).join('\n').trim() || '正在更新…';
      });
      $('#operationOutput').textContent = result.stdout || 'Mihomo 内核已更新。';
      toast('Mihomo 内核更新完成');
      await Promise.all([loadKernelInfo(), loadStatus()]);
    } catch (error) {
      $('#operationOutput').textContent = `更新失败\n\n${error.message}`;
    } finally { setBusy(false); }
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

  function loadPanel(force) {
    const frame = $('#mihomoFrame');
    const status = $('#panelFrameStatus');
    if (!state.panelUrl) {
      status.textContent = '未找到 Mihomo external-controller 地址，请先启动 Clash。';
      frame.classList.remove('loaded');
      return;
    }
    const target = force ? `${state.panelUrl}${state.panelUrl.includes('?') ? '&' : '?'}_=${Date.now()}` : state.panelUrl;
    if (!force && frame.dataset.url === state.panelUrl) return;
    status.textContent = '正在连接本机 Mihomo 面板…';
    frame.classList.remove('loaded');
    frame.dataset.url = state.panelUrl;
    frame.src = target;
  }

  $$('[data-nav]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.nav)));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
  $$('[data-action]').forEach((button) => button.addEventListener('click', () => runAction(button.dataset.action)));
  $$('[data-close-sheet]').forEach((element) => element.addEventListener('click', closeOperation));
  $('#refreshButton').addEventListener('click', () => Promise.all([loadStatus(), loadSettings(), loadKernelInfo(), loadTraffic(), loadLatency()]));
  $('#settingsForm').addEventListener('submit', (event) => { event.preventDefault(); saveSettings(false); });
  $('#saveRestartButton').addEventListener('click', () => saveSettings(true));
  $('#reloadConfigButton').addEventListener('click', loadConfig);
  $('#copyConfigButton').addEventListener('click', copyConfig);
  $('#reloadLogsButton').addEventListener('click', loadLogs);
  $('#openPanelButton').addEventListener('click', () => navigate('mihomo'));
  $('#externalPanelButton').addEventListener('click', openPanel);
  $('#reloadPanelButton').addEventListener('click', () => loadPanel(true));
  $('#mihomoFrame').addEventListener('load', () => {
    $('#mihomoFrame').classList.add('loaded');
    $('#panelFrameStatus').textContent = '';
  });
  $('#mihomoFrame').addEventListener('error', () => {
    $('#mihomoFrame').classList.remove('loaded');
    $('#panelFrameStatus').textContent = '面板无法内嵌，请使用下方按钮打开。';
  });
  $('#refreshLatencyButton').addEventListener('click', loadLatency);
  $('#reloadSubscriptionsButton').addEventListener('click', loadSettings);
  $('#updateKernelButton').addEventListener('click', updateKernel);
  window.addEventListener('resize', drawSpeedChart);
  restoreCachedKernelInfo();
  Promise.all([loadStatus(), loadSettings(), loadTraffic()]);
  requestAnimationFrame(() => {
    setTimeout(loadKernelInfo, 120);
    setTimeout(loadLatency, 350);
  });
  setInterval(loadTraffic, 2000);
  setInterval(loadLatency, 30000);
}());
