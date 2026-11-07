#!/bin/zsh
# 一键把「网页服务 + 监控」都拉到后台，然后静默退出。
# 加到「系统设置 → 通用 → 登录项」，以后开机就能直接打开网页用。
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
APP="$ROOT/app"
DATA="$ROOT/.data"
mkdir -p "$DATA"

if ! command -v node >/dev/null 2>&1; then
  source ~/.nvm/nvm.sh 2>/dev/null
fi
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 没找到 Node，先装：https://nodejs.org"; sleep 3; exit 1
fi

# ① 构建产物不存在就先构建
if [ ! -d "$APP/.next" ]; then
  echo "首次准备，正在构建（约 40 秒）…"
  ( cd "$APP" && npm run build >"$DATA/build.log" 2>&1 ) || {
    echo "❌ 构建失败，看 $DATA/build.log"; sleep 5; exit 1
  }
fi

# ② 服务：已在跑就不重复起
if curl -s -o /dev/null -m 2 "http://127.0.0.1:3300/"; then
  echo "✓ 网页服务已在运行"
else
  echo "启动网页服务…"
  ( cd "$APP" && nohup npm start >>"$DATA/server.log" 2>&1 & echo $! >"$DATA/server.pid" )
  for i in {1..30}; do
    sleep 1
    curl -s -o /dev/null -m 2 "http://127.0.0.1:3300/" && break
  done
fi

# ③ 监控：调用现成的静默启动脚本
"$ROOT/启动监控.command" >/dev/null 2>&1

sleep 2
if curl -s -o /dev/null -m 2 "http://127.0.0.1:3300/"; then
  echo "✓ 已就绪：http://127.0.0.1:3300"
else
  echo "⚠ 服务没起来，看 $DATA/server.log"
  sleep 4
fi
