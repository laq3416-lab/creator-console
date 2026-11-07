#!/bin/zsh
# 静默启动：起完立刻脱离终端，窗口自动关闭。日志在 .data/watcher.log
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
APP="$ROOT/app"
DATA="$ROOT/.data"
LOG="$DATA/watcher.log"

if ! command -v node >/dev/null 2>&1; then
  source ~/.nvm/nvm.sh 2>/dev/null
fi
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 没找到 Node，先装：https://nodejs.org"
  sleep 3
  exit 1
fi

# 已经在跑就不重复起（两个进程会抢同一个浏览器 Profile）
if [ -f "$DATA/watcher.json" ]; then
  PID=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$DATA/watcher.json','utf8')).pid)}catch(e){console.log(0)}" 2>/dev/null)
  if [ -n "$PID" ] && [ "$PID" != "0" ] && kill -0 "$PID" 2>/dev/null; then
    echo "监控已在运行（pid $PID），无需重复启动。"
    sleep 2
    exit 0
  fi
fi

mkdir -p "$DATA"
cd "$APP" || exit 1

echo "启动中…" 
nohup node scripts/watch.mjs >> "$LOG" 2>&1 &
echo $! > "$DATA/watcher.pid"
disown 2>/dev/null || true

sleep 2
if [ -f "$DATA/watcher.json" ]; then
  NEWPID=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$DATA/watcher.json','utf8')).pid)}catch(e){console.log('?')}" 2>/dev/null)
  echo "✓ 监控已在后台运行（pid $NEWPID），本窗口即将关闭。"
  echo "  日志：$LOG"
  echo "  要停止：双击 停止监控.command"
else
  echo "⚠ 启动异常，看日志：$LOG"
  sleep 4
fi
