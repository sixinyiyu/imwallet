#!/bin/bash
# IMWallet Server - EC2 部署脚本（方案 B：制品包含完整 node_modules）
# 用法: ./deploy.sh <version>
# 示例: ./deploy.sh 1.0.3
#
# 制品包含完整 node_modules，服务器无需联网安装依赖。
# 自动检测平台，下载对应的平台包（debian/rhel/windows）。
# 数据库初始化和种子数据在应用启动时自动执行（Flyway-style）。

set -e

VERSION="${1:?请指定版本号，如: ./deploy.sh 1.0.3}"
APP_DIR="/opt/imwallet-server"
ENV_FILE="$APP_DIR/.env.production"
SERVICE_NAME="imwallet"

# 自动检测平台
detect_platform() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian|linuxmint|pop) echo "debian" ;;
      amzn|rhel|centos|fedora|rocky|alma) echo "rhel" ;;
      *) echo "rhel" ;;  # 默认对未知 Linux 使用 rhel
    esac
  elif [ -f /etc/redhat-release ]; then
    echo "rhel"
  else
    echo "debian"  # 默认回退
  fi
}

PLATFORM=$(detect_platform)
RELEASE_URL="https://github.com/sixinyiyu/imwallet/releases/download/server-v${VERSION}/imwallet-server-systemd-${VERSION}-${PLATFORM}.tar.gz"

echo "========================================="
echo "  IMWallet Server 部署 v${VERSION} (${PLATFORM})"
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

# 3. 下载平台对应的制品包（包含完整 node_modules）
echo "⬇️  下载 imwallet-server-systemd-${VERSION}-${PLATFORM}.tar.gz ..."
cd /tmp
curl -L -o "imwallet-server-systemd-${VERSION}-${PLATFORM}.tar.gz" "$RELEASE_URL"

# 4. 备份当前版本
if [ -d "$APP_DIR/dist" ]; then
  echo "📦 备份当前版本..."
  cp -r "$APP_DIR/dist" "$APP_DIR/dist.bak"
fi

# 5. 解压覆盖（制品包含完整 node_modules，无需服务器联网安装）
echo "📂 解压到 $APP_DIR ..."
tar -xzf "imwallet-server-systemd-${VERSION}-${PLATFORM}.tar.gz" -C /tmp
cp -r /tmp/imwallet-server-${PLATFORM}/dist "$APP_DIR/"
cp -r /tmp/imwallet-server-${PLATFORM}/node_modules "$APP_DIR/"
cp -r /tmp/imwallet-server-${PLATFORM}/prisma "$APP_DIR/"
cp /tmp/imwallet-server-${PLATFORM}/package.json "$APP_DIR/"

# 6. 重启服务（应用启动时自动执行 init.sql + seed）
echo "🔄 重启 imwallet 服务..."
sudo systemctl restart "$SERVICE_NAME"

# 7. 等待并检查状态
sleep 3
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "✅ 部署成功! imwallet v${VERSION} (${PLATFORM}) 已启动"
  sudo systemctl status "$SERVICE_NAME" --no-pager
else
  echo "❌ 服务启动失败，查看日志:"
  sudo journalctl -u "$SERVICE_NAME" -n 30 --no-pager
  exit 1
fi

# 8. 清理临时文件
rm -f "/tmp/imwallet-server-systemd-${VERSION}-${PLATFORM}.tar.gz"
rm -rf /tmp/imwallet-server-${PLATFORM}

echo "🎉 部署完成!"
