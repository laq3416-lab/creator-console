import { spawn } from 'node:child_process';

/** Run a job in its own process group so a hung browser can be stopped with its job. */
export function runChild(script, args = [], { cwd = process.cwd(), env = process.env, timeoutMs = 180_000, graceMs = 5_000 } = {}) {
  return new Promise((resolve) => {
    let out = '', timedOut = false, settled = false, escalation;
    const child = spawn(process.execPath, [script, ...args], {
      cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const append = (data) => { out = (out + data.toString()).slice(-20000); };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    function stop(signal) {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) { if (error.code !== 'ESRCH') append(`\n结束进程失败: ${error.message}`); }
    }
    const timer = setTimeout(() => {
      timedOut = true;
      append(`\n任务超过 ${Math.round(timeoutMs / 1000)} 秒，已停止。`);
      stop('SIGTERM');
      escalation = setTimeout(() => stop('SIGKILL'), graceMs);
      escalation.unref();
    }, timeoutMs);
    function finish(code, signal, error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (escalation) clearTimeout(escalation);
      if (error) append(`\n启动失败: ${error.message}`);
      resolve({ ok: !timedOut && !error && code === 0, timedOut, code, signal, output: out });
    }
    child.once('error', (error) => finish(null, null, error));
    child.once('close', (code, signal) => finish(code, signal, null));
  });
}
