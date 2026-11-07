#!/bin/zsh
# 首次安装：双击运行即可。装完会自动启动并打开浏览器。
cd "$(dirname "$0")/app" || exit 1

echo "================================"
echo " 自媒体中控台 · 首次安装"
echo "================================"
echo

# 1) 检查 Node
if ! command -v node >/dev/null 2>&1; then
  source ~/.nvm/nvm.sh 2>/dev/null
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 没有检测到 Node.js"
  echo
  echo "请先装 Node（选 LTS 版本）：https://nodejs.org"
  echo "装完再双击本文件。"
  echo
  read "?按回车关闭..."
  exit 1
fi
echo "✓ Node $(node -v)"

# 2) 检查 ffmpeg（可选）
if command -v ffmpeg >/dev/null 2>&1; then
  echo "✓ ffmpeg 已安装（能算镜头节奏）"
else
  echo "⚠ 没装 ffmpeg，镜头节奏分析用不了。装法：brew install ffmpeg"
fi

# 3) 装依赖
if [ ! -d node_modules ]; then
  echo
  echo "首次安装依赖，大约 3 分钟…"
  npm install --no-audit --no-fund || {
    echo "❌ 依赖安装失败，把上面的报错截图发给作者"
    read "?按回车关闭..."
    exit 1
  }
fi
echo "✓ 依赖就绪"

# 4) 构建并启动
echo
echo "构建中，约 30 秒…"
for i in 1 2; do
  if npm run build >/tmp/cc-build.log 2>&1; then echo "✓ 构建完成"; break; fi
  if [ $i -eq 2 ]; then echo "❌ 构建失败，日志：/tmp/cc-build.log"; tail -15 /tmp/cc-build.log; read "?按回车关闭..."; exit 1; fi
  echo "  构建失败，重试…"; sleep 2
done
echo
echo "正在打开 http://127.0.0.1:3300/setup"
echo "（关掉这个窗口就等于停止服务）"
echo
sleep 1
open "http://127.0.0.1:3300/setup" 2>/dev/null &
exec npm start
