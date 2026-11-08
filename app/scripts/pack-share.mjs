/**
 * 打分享包：生成一个干净的 zip，别人解压双击就能跑。
 *
 * 安全底线（绝不能漏）：
 *   · .env.local      里面有我的 API Key
 *   · .data/          里面有我的抖音登录态和全部个人数据
 *   · node_modules / .next   体积大且平台相关
 *
 * 用法：npm run share
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const APP = process.cwd();
const ROOT = path.resolve(APP, '..');
const STAGE = path.join(ROOT, '.share', '自媒体中控台');
const OUT = path.join(ROOT, '分享包');
const VERSION = 'v0.1.3';

const EXCLUDE = new Set([
  'node_modules',
  '.next',
  '.env.local',
  '.env',
  'next-env.d.ts',
  'data',
  '.DS_Store',
]);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/* 1) 清场 */
fs.rmSync(path.join(ROOT, '.share'), { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

/* 2) 拷源码 */
copyDir(APP, path.join(STAGE, 'app'));

/* 3) 兜底检查：源码里有没有漏网的密钥 */
function scan(dir) {
  const hits = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    if (entry.name === 'pack-share.mjs') continue; // 扫描器自己含检测规则，跳过
    if (entry.isDirectory()) hits.push(...scan(p));
    else if (/\.(ts|tsx|mjs|js|json|md)$/.test(entry.name)) {
      const t = fs.readFileSync(p, 'utf8');
      if (/sk-[A-Za-z0-9]{20,}/.test(t)) hits.push(p);
      // 要求 = 后面真的跟着一长串凭证，避免把 sessionId=${...} 这种模板字符串误判
      if (/sessionid=[A-Za-z0-9%_-]{16,}|passport_csrf_token=[A-Za-z0-9]{16,}/i.test(t)) hits.push(p);
    }
  }
  return hits;
}
const leaks = scan(path.join(STAGE, 'app'));
if (leaks.length) {
  console.error('✗ 源码里发现疑似密钥，停止打包：');
  for (const f of leaks) console.error('   ', f);
  process.exit(1);
}
console.log('✓ 密钥扫描通过');

/* 4) 观众用的启动脚本 */
const SH = (body) =>
  `#!/bin/zsh
cd "$(dirname "$0")/app" || exit 1
${body}`;

const macInstall = SH(`
echo "================================"
echo "  自媒体中控台 · 安装"
echo "================================"
echo

if ! command -v node >/dev/null 2>&1; then
  source ~/.nvm/nvm.sh 2>/dev/null
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 没检测到 Node.js（这是运行环境，装一次就行）"
  echo
  echo "1. 打开 https://nodejs.org"
  echo "2. 下载 LTS 版本，一路下一步装完"
  echo "3. 关掉这个窗口，重新双击本文件"
  echo
  open "https://nodejs.org/zh-cn" 2>/dev/null
  read "?按回车关闭..."
  exit 1
fi

echo "✓ Node $(node -v)"

if command -v ffmpeg >/dev/null 2>&1; then
  echo "✓ ffmpeg 已安装（会算镜头节奏）"
else
  echo "⚠ 没有 ffmpeg，跳过镜头节奏分析。想装：brew install ffmpeg"
fi

if [ ! -d node_modules ]; then
  echo
  echo "首次安装依赖，大约 3 分钟，请勿关闭窗口…"
  npm install --no-audit --no-fund || {
    echo
    echo "❌ 安装失败。常见原因：网络问题，重试一次通常就好。"
    read "?按回车关闭..."
    exit 1
  }
fi
echo "✓ 依赖就绪"

echo
echo "构建中，约 40 秒…"
# 构建偶尔会失败一次（并发收集页面数据时），重试一次通常就好
for i in 1 2; do
  echo "  第 $i 次尝试…"
  if npm run build >/tmp/cc-build.log 2>&1; then
    echo "✓ 构建完成"
    break
  fi
  if [ $i -eq 2 ]; then
    echo
    echo "❌ 构建连续两次失败。日志：/tmp/cc-build.log"
    tail -15 /tmp/cc-build.log
    read "?按回车关闭..."
    exit 1
  fi
  echo "  失败，重试…"
  sleep 2
done
echo
echo "正在打开浏览器…（关掉本窗口 = 停止服务）"
echo
sleep 1
open "http://127.0.0.1:3300/setup" 2>/dev/null &
exec npm start
`);

const macWatch = `#!/bin/zsh
# 静默启动：起完立刻脱离终端，窗口自动关闭
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"; DATA="$ROOT/.data"; LOG="$DATA/watcher.log"
if ! command -v node >/dev/null 2>&1; then source ~/.nvm/nvm.sh 2>/dev/null; fi
if ! command -v node >/dev/null 2>&1; then echo "❌ 先装 Node：https://nodejs.org"; sleep 3; exit 1; fi

if [ -f "$DATA/watcher.json" ]; then
  PID=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$DATA/watcher.json','utf8')).pid)}catch(e){console.log(0)}" 2>/dev/null)
  if [ -n "$PID" ] && [ "$PID" != "0" ] && kill -0 "$PID" 2>/dev/null; then
    echo "监控已在运行（pid $PID）"; sleep 2; exit 0
  fi
fi

mkdir -p "$DATA"; cd "$ROOT/app" || exit 1
echo "启动中…"
nohup node scripts/watch.mjs >> "$LOG" 2>&1 &
echo $! > "$DATA/watcher.pid"
disown 2>/dev/null || true
sleep 2
if [ -f "$DATA/watcher.json" ]; then
  NEWPID=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$DATA/watcher.json','utf8')).pid)}catch(e){console.log('?')}" 2>/dev/null)
  echo "✓ 已在后台运行（pid $NEWPID），本窗口即将关闭"
  echo "  停止：双击 3-停止监控.command"
else
  echo "⚠ 启动异常，看日志：$LOG"; sleep 4
fi
`;

const macStop = `#!/bin/zsh
cd "$(dirname "$0")" || exit 1
DATA="$(pwd)/.data"
if ! command -v node >/dev/null 2>&1; then source ~/.nvm/nvm.sh 2>/dev/null; fi
PID=""
[ -f "$DATA/watcher.json" ] && PID=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$DATA/watcher.json','utf8')).pid)}catch(e){}" 2>/dev/null)
[ -z "$PID" ] && [ -f "$DATA/watcher.pid" ] && PID=$(cat "$DATA/watcher.pid")
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null; sleep 1; kill -9 "$PID" 2>/dev/null
  echo "✓ 监控已停止"
else
  pkill -f "scripts/watch.mjs" 2>/dev/null && echo "✓ 已停止" || echo "监控本来就没在运行"
fi
rm -f "$DATA/watcher.json" "$DATA/watcher.pid" 2>/dev/null
sleep 2
`;

const macBoot = `#!/bin/zsh
# 一键把「网页服务 + 监控」拉到后台。建议加进登录项，开机就能直接用。
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"; APP="$ROOT/app"; DATA="$ROOT/.data"
mkdir -p "$DATA"
if ! command -v node >/dev/null 2>&1; then source ~/.nvm/nvm.sh 2>/dev/null; fi
if ! command -v node >/dev/null 2>&1; then echo "先装 Node：https://nodejs.org"; sleep 3; exit 1; fi

if [ ! -d "$APP/.next" ]; then
  echo "首次准备，构建中（约 40 秒）…"
  ( cd "$APP" && npm run build >"$DATA/build.log" 2>&1 ) || { echo "构建失败：$DATA/build.log"; sleep 5; exit 1; }
fi

if curl -s -o /dev/null -m 2 "http://127.0.0.1:3300/"; then
  echo "网页服务已在运行"
else
  echo "启动网页服务…"
  ( cd "$APP" && nohup npm start >>"$DATA/server.log" 2>&1 & echo $! >"$DATA/server.pid" )
  for i in {1..30}; do sleep 1; curl -s -o /dev/null -m 2 "http://127.0.0.1:3300/" && break; done
fi

"$ROOT/2-启动监控.command" >/dev/null 2>&1
sleep 2
if curl -s -o /dev/null -m 2 "http://127.0.0.1:3300/"; then
  echo "✓ 已就绪：http://127.0.0.1:3300"
else
  echo "⚠ 服务没起来，看 $DATA/server.log"; sleep 4
fi
`;

const winInstall = `@echo off
chcp 65001 >nul
cd /d "%~dp0app"
echo ================================
echo   自媒体中控台 - 安装
echo ================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo 没有检测到 Node.js（运行环境，装一次就行）
  echo.
  echo 1. 打开 https://nodejs.org
  echo 2. 下载 LTS 版本，一路下一步
  echo 3. 关掉这个窗口，重新双击本文件
  echo.
  start https://nodejs.org/zh-cn
  pause
  exit /b 1
)
echo 依赖安装（首次约 3 分钟）...
if not exist node_modules (
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo 安装失败，重试一次。 & pause & exit /b 1 )
)
echo 构建中（约 40 秒）...
call npm run build >nul 2>nul
if errorlevel 1 ( echo 构建失败 & pause & exit /b 1 )
echo 正在打开浏览器...
start http://127.0.0.1:3300/setup
call npm start
pause
`;

const winWatch = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".data" mkdir ".data"
echo 启动中（后台运行，本窗口会自动关闭）...
start "" /b cmd /c "cd /d %~dp0app && node scripts/watch.mjs >> ..\.data\watcher.log 2>&1"
timeout /t 2 >nul
echo 已在后台运行。停止：双击 3-停止监控.bat
timeout /t 2 >nul
exit
`;

const winStop = `@echo off
chcp 65001 >nul
taskkill /f /fi "WINDOWTITLE eq watch*" >nul 2>nul
wmic process where "commandline like '%%scripts\\watch.mjs%%'" delete >nul 2>nul
del /q ".data\watcher.json" ".data\watcher.pid" 2>nul
echo 监控已停止
pause
`;

const guide = fs.readFileSync(path.join(APP, 'scripts', 'templates', '使用说明.md'), 'utf8');

const files = [
  ['1-安装并启动.command', macInstall, 0o755],
  ['2-启动监控.command', macWatch, 0o755],
  ['3-停止监控.command', macStop, 0o755],
  ['1-安装并启动.bat', winInstall, 0o644],
  ['4-开机自启.command', macBoot, 0o755],
  ['2-启动监控.bat', winWatch, 0o644],
  ['3-停止监控.bat', winStop, 0o644],
  ['使用说明.md', guide, 0o644],
];
for (const [name, content, mode] of files) {
  const p = path.join(STAGE, name);
  fs.writeFileSync(p, content);
  fs.chmodSync(p, mode);
}

/* 5) 打 zip */
const zipName = `自媒体中控台-${VERSION}.zip`;
const zipPath = path.join(OUT, zipName);
fs.rmSync(zipPath, { force: true });
// macOS 上 ditto 才正确保留 UTF-8 文件名，zip 命令会让中文变乱码
execFileSync('ditto', ['-c', '-k', '--keepParent', STAGE, zipPath]);

const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`✓ 已生成：分享包/${zipName}（${size} MB）`);
/* 6) 解包校验：确认该有的在、不该有的不在 */
const CHECK = path.join(ROOT, '.share', 'verify');
fs.rmSync(CHECK, { recursive: true, force: true });
execFileSync('ditto', ['-x', '-k', zipPath, CHECK]);
const top = path.join(CHECK, '自媒体中控台');
const must = ['使用说明.md', '1-安装并启动.command', '2-启动监控.command', '3-停止监控.command', '4-开机自启.command', '1-安装并启动.bat', '2-启动监控.bat', '3-停止监控.bat', 'app/package.json'];
const forbidden = ['app/.env.local', 'app/data', 'app/node_modules', 'app/.next'];

const missing = must.filter((f) => !fs.existsSync(path.join(top, f)));
const leaked = forbidden.filter((f) => fs.existsSync(path.join(top, f)));

console.log('\n包内校验：');
console.log('  必需文件：', missing.length ? '✗ 缺 ' + missing.join(', ') : '✓ 齐全');
console.log('  敏感文件：', leaked.length ? '✗ 泄漏 ' + leaked.join(', ') : '✓ 无泄漏');
console.log('  顶层内容：', fs.readdirSync(top).join('  '));
if (missing.length || leaked.length) process.exit(1);
fs.rmSync(CHECK, { recursive: true, force: true });
