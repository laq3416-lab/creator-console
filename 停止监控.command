#!/bin/zsh
# 停止后台监控
cd "$(dirname "$0")" || exit 1
DATA="$(pwd)/.data"

if ! command -v node >/dev/null 2>&1; then
  source ~/.nvm/nvm.sh 2>/dev/null
fi

PID=""
[ -f "$DATA/watcher.json" ] && PID=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$DATA/watcher.json','utf8')).pid)}catch(e){}" 2>/dev/null)
[ -z "$PID" ] && [ -f "$DATA/watcher.pid" ] && PID=$(cat "$DATA/watcher.pid")

if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null
  sleep 1
  kill -9 "$PID" 2>/dev/null
  echo "✓ 监控已停止（pid $PID）"
else
  # 兜底：按进程名找
  pkill -f "scripts/watch.mjs" 2>/dev/null && echo "✓ 已停止" || echo "监控本来就没在运行"
fi

rm -f "$DATA/watcher.json" "$DATA/watcher.pid" 2>/dev/null
sleep 2
