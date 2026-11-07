/**
 * 用 macOS launchd 让监控常驻。
 *
 * 装完之后：
 *   · 开机 / 登录自动启动
 *   · 进程挂了 10 秒后自动拉起
 *   · 不依赖终端、不依赖任何 agent 会话
 *
 * 用法：
 *   node scripts/service.mjs install    安装并立即启动
 *   node scripts/service.mjs status     看状态
 *   node scripts/service.mjs uninstall  卸载
 *   node scripts/service.mjs dry-run    只打印 plist，不写文件
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const LABEL = 'com.creator-console.watcher';
const APP_DIR = process.cwd();
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const LOG_DIR = path.resolve(APP_DIR, '..', '.data');

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${path.join(APP_DIR, 'scripts', 'watch.mjs')}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${APP_DIR}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>${os.homedir()}</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>StandardOutPath</key>
  <string>${path.join(LOG_DIR, 'watcher.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(LOG_DIR, 'watcher.err.log')}</string>
</dict>
</plist>
`;

const cmd = process.argv[2] ?? 'status';

function sh(...args) {
  try {
    return execFileSync(args[0], args.slice(1), { encoding: 'utf8' }).trim();
  } catch (e) {
    return (e.stdout ?? '') + (e.stderr ?? '') || String(e.message);
  }
}

if (cmd === 'dry-run') {
  console.log(plist);
} else if (cmd === 'install') {
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  // 先卸掉旧的，避免重复注册
  sh('launchctl', 'unload', PLIST);
  fs.writeFileSync(PLIST, plist);
  console.log('已写入', PLIST);
  console.log(sh('launchctl', 'load', '-w', PLIST) || 'load 已执行');
  console.log('\n装好了。以后开机自动跑，不用管终端。');
  console.log('看日志：', path.join(LOG_DIR, 'watcher.log'));
  console.log('卸载：npm run service:uninstall');
} else if (cmd === 'uninstall') {
  sh('launchctl', 'unload', PLIST);
  if (fs.existsSync(PLIST)) fs.unlinkSync(PLIST);
  console.log('已卸载');
} else {
  const out = sh('launchctl', 'list');
  const line = out.split('\n').find((l) => l.includes(LABEL));
  console.log(line ? `运行中：${line}` : '未安装或未运行');
  console.log('plist:', fs.existsSync(PLIST) ? PLIST : '（不存在）');
}
