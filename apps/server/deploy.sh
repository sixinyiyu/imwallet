#!/bin/bash
# IMWallet Server - EC2 部署脚本
# 用法: ./deploy.sh <version>
# 示例: ./deploy.sh 1.0.0

set -e

VERSION="${1:?请指定版本号，如: ./deploy.sh 1.0.0}"
APP_DIR="/opt/imwallet-server"
ENV_FILE="$APP_DIR/.env.production"
SERVICE_NAME="imwallet"
RELEASE_URL="https://github.com/sixinyiyu/imwallet/releases/download/server-v${VERSION}/imwallet-server-systemd-${VERSION}.tar.gz"

echo "========================================="
echo "  IMWallet Server 部署 v${VERSION}"
echo "========================================="

# 1. 创建应用目录（首次）
if [ ! -d "$APP_DIR" ]; then
  echo "📁 创建应用目录: $APP_DIR"
  sudo mkdir -p "$APP_DIR"
  sudo chown $(whoami):$(whoami) "$APP_DIR"
fi

# 2. 检查 .env.production 是否存在
if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  未找到 $ENV_FILE"
  echo "   请先创建并填写生产环境变量:"
  echo "   cp $APP_DIR/.env.example $ENV_FILE"
  echo "   vim $ENV_FILE"
  exit 1
fi

# 3. 下载制品
echo "⬇️  下载 imwallet-server-systemd-${VERSION}.tar.gz ..."
cd /tmp
curl -L -o "imwallet-server-systemd-${VERSION}.tar.gz" "$RELEASE_URL"

# 4. 备份当前版本
if [ -d "$APP_DIR/dist" ]; then
  echo "📦 备份当前版本..."
  sudo cp -r "$APP_DIR/dist" "$APP_DIR/dist.bak"
fi

# 5. 解压覆盖
echo "📂 解压到 $APP_DIR ..."
tar -xzf "imwallet-server-systemd-${VERSION}.tar.gz" -C /tmp
sudo cp -r /tmp/imwallet-server/dist "$APP_DIR/"
sudo cp -r /tmp/imwallet-server/node_modules "$APP_DIR/"
sudo cp -r /tmp/imwallet-server/prisma "$APP_DIR/"
sudo cp /tmp/imwallet-server/package.json "$APP_DIR/"

# 6. 执行数据库迁移
echo "🗄️  执行数据库迁移..."
cd "$APP_DIR"
export DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | sed 's/^DATABASE_URL=//')
npx prisma@6 migrate deploy

# 7. 重启服务
echo "🔄 重启 imwallet 服务..."
sudo systemctl restart "$SERVICE_NAME"

# 8. 等待并检查状态
sleep 3
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "✅ 部署成功! imwallet v${VERSION} 已启动"
  sudo systemctl status "$SERVICE_NAME" --no-pager
else
  echo "❌ 服务启动失败，查看日志:"
  sudo journalctl -u "$SERVICE_NAME" -n 30 --no-pager
  exit 1
fi

# 9. 清理临时文件
rm -f "/tmp/imwallet-server-systemd-${VERSION}.tar.gz"
rm -rf /tmp/imwallet-server

echo "🎉 部署完成!"