#!/bin/bash
# IMWallet Server - PM2 部署脚本
# 用法: ./deploy-pm2.sh <version>
# 示例: ./deploy-pm2.sh 1.0.0

set -e

VERSION="${1:?请指定版本号，如: ./deploy-pm2.sh 1.0.0}"
APP_DIR="/opt/imwallet-server"
ENV_FILE="$APP_DIR/.env.production"
RELEASE_URL="https://github.com/sixinyiyu/imwallet/releases/download/server-pm2-v${VERSION}/imwallet-server-pm2-${VERSION}.tar.gz"

echo "========================================="
echo "  IMWallet Server (PM2) 部署 v${VERSION}"
echo "========================================="

# 1. 检查 PM2
if ! command -v pm2 &>/dev/null; then
  echo "❌ PM2 未安装，请先安装: npm install -g pm2"
  exit 1
fi

# 2. 创建应用目录
if [ ! -d "$APP_DIR" ]; then
  echo "📁 创建应用目录: $APP_DIR"
  sudo mkdir -p "$APP_DIR"
  sudo chown $(whoami):$(whoami) "$APP_DIR"
fi

# 3. 创建日志目录
sudo mkdir -p /var/log/imwallet
sudo chown $(whoami):$(whoami) /var/log/imwallet

# 4. 检查 .env.production
if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  未找到 $ENV_FILE"
  echo "   请先创建: cp $APP_DIR/.env.example $ENV_FILE && vim $ENV_FILE"
  exit 1
fi

# 5. 下载制品
echo "⬇️  下载 imwallet-server-pm2-${VERSION}.tar.gz ..."
cd /tmp
curl -L -o "imwallet-server-pm2-${VERSION}.tar.gz" "$RELEASE_URL"

# 6. 解压覆盖
echo "📂 解压到 $APP_DIR ..."
tar -xzf "imwallet-server-pm2-${VERSION}.tar.gz" -C /tmp
cp -r /tmp/imwallet-server/dist "$APP_DIR/"
cp -r /tmp/imwallet-server/node_modules "$APP_DIR/"
cp -r /tmp/imwallet-server/prisma "$APP_DIR/"
cp /tmp/imwallet-server/package.json "$APP_DIR/"
cp /tmp/imwallet-server/ecosystem.config.js "$APP_DIR/"

# 7. 执行数据库迁移
echo "🗄️  执行数据库迁移..."
cd "$APP_DIR"
npx prisma migrate deploy

# 8. 加载环境变量并重启 PM2
echo "🔄 重启 imwallet (PM2)..."
cd "$APP_DIR"

# 停止旧进程（如果存在）
pm2 delete imwallet 2>/dev/null || true

# 启动新进程
pm2 start ecosystem.config.js --env production

# 保存 PM2 进程列表
pm2 save

# 9. 检查状态
sleep 3
pm2 status

# 10. 清理临时文件
rm -f "/tmp/imwallet-server-pm2-${VERSION}.tar.gz"
rm -rf /tmp/imwallet-server

echo "🎉 PM2 部署完成!"
echo ""
echo "📋 常用命令:"
echo "   查看状态:    pm2 status"
echo "   查看日志:    pm2 logs imwallet"
echo "   重启:        pm2 restart imwallet"
echo "   停止:        pm2 stop imwallet"
echo "   监控面板:    pm2 monit"
