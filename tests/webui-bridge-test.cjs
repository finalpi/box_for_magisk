const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../webroot/app.js'), 'utf8');
const bridge = source.slice(source.indexOf('  function exec(commandText)'), source.indexOf('  function demoResponse'));
let pending;
let painted = false;
const context = {
  window: { ksu: { spawn(command, args, options, callback) {
    assert.equal(painted, true, 'native execution must wait for UI paint');
    pending = { command, args: JSON.parse(args), callback };
  } } },
  requestAnimationFrame(callback) { setTimeout(() => { painted = true; callback(); }, 0); },
  setTimeout, Date, Math, Error, Number, JSON,
  CONTROL: '/data/adb/box/scripts/webui.service',
};
vm.createContext(context);
vm.runInContext(`${bridge}\nthis.call = exec; this.stream = spawn;`, context);
(async () => {
  const promise = context.call('/data/adb/box/scripts/webui.service set ipv6 dHJ1ZQ==');
  assert.equal(pending, undefined, 'native execution must not block initial click');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(pending.args, ['set', 'ipv6', 'dHJ1ZQ==']);
  let callback = context.window[pending.callback];
  callback.stdout.emit('data', 'Saved ipv6');
  callback.emit('exit', 0);
  assert.equal((await promise).stdout, 'Saved ipv6');
  const progress = [];
  const failure = context.stream('subscription', (out, err) => progress.push(out + err));
  await new Promise(resolve => setTimeout(resolve, 20));
  callback = context.window[pending.callback];
  callback.stdout.emit('data', '[2/4] Downloading');
  assert.match(progress[0], /Downloading/);
  callback.stderr.emit('data', 'Download failed');
  callback.emit('exit', 1);
  await assert.rejects(failure, /Download failed/);
  console.log('WebUI bridge tests passed: paint, arguments, live logs, failure propagation');
})().catch(error => { console.error(error); process.exitCode = 1; });
