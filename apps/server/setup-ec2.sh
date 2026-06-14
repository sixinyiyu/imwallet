#!/bin/bash
# IMWallet Server - EC2 首次初始化脚本
# 支持 Debian/Ubuntu 和 Amazon Linux / RHEL / CentOS
# 用法: sudo bash setup-ec2.sh

set -e

APP_DIR="/opt/imwallet-server"
SERVICE_USER="imwallet"

echo "========================================="
echo "  IMWallet Server - EC2 初始化"
echo "========================================="

# 检测系统类型
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="${ID}"
  OS_NAME="${PRETTY_NAME:-$ID}"
else
  echo "❌ 无法检测操作系统"
  exit 1
fi

echo "🖥️  检测到系统: $OS_NAME"

# 1. 安装 Node.js 22
echo "📦 安装 Node.js 22..."
if [ "$OS_ID" = "amzn" ] || [ "$OS_ID" = "rhel" ] || [ "$OS_ID" = "centos" ] || [ "$OS_ID" = "rocky" ] || [ "$OS_ID" = "almalinux" ]; then
  # Amazon Linux / RHEL 系列
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs
elif [ "$OS_ID" = "debian" ] || [ "$OS_ID" = "ubuntu" ] || [ "$OS_ID" = "pop" ] || [ "$OS_ID" = "linuxmint" ]; then
  # Debian / Ubuntu 系列
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
else
  echo "❌ 不支持的操作系统: $OS_NAME"
  echo "   请手动安装 Node.js 22 后重新运行此脚本"
  exit 1
fi

node --version
npm --version

# 2. 创建服务用户
echo "👤 创建服务用户: $SERVICE_USER"
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd -r -s /bin/false -d "$APP_DIR" "$SERVICE_USER"
fi

# 3. 创建应用目录
echo "📁 创建应用目录: $APP_DIR"
mkdir -p "$APP_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# 4. 创建 .env.production（需要手动填写）
if [ ! -f "$APP_DIR/.env.production" ]; then
  cat > "$APP_DIR/.env.production" << 'EOF'
# ===== IMWallet Server 生产环境配置 =====
# 请根据实际情况修改以下配置

# 服务端口
PORT=3000
NODE_ENV=production

# 数据库 (AWS RDS PostgreSQL)
DATABASE_URL=postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/DATABASE_NAME

# JWT
JWT_SECRET=CHANGE_ME_TO_A_STRONG_RANDOM_STRING
JWT_EXPIRES_IN=7d

# RSA 密钥 (生产环境必须设置，否则每次重启会重新生成)
# 推荐方式: 使用文件路径，避免换行符转义问题
# 生成方式: ssh-keygen -t rsa -b 2048 -m PEM -f /opt/imwallet-server/keys/private.pem
# RSA_PRIVATE_KEY_PATH=/opt/imwallet-server/keys/private.pem
# RSA_PUBLIC_KEY_PATH=/opt/imwallet-server/keys/public.pem
# 备选方式: 内联字符串 (systemd 会吃掉反斜杠，需要用 \\n)
# RSA_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----
# RSA_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----

# 种子数据密码 (首次 db:seed 时使用)
SEED_PASSWORD=CHANGE_ME

# 手续费
FEE_RATE=0.005
FEE_MODE=DEDUCTED
EOF
  echo "⚠️  已生成 $APP_DIR/.env.production"
  echo "   请编辑并填写真实值: sudo vim $APP_DIR/.env.production"
  echo "   填写完成后重新运行此脚本"
  exit 0
fi

# 5. 安装 Systemd 服务
echo "⚙️  安装 Systemd 服务..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/imwallet.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable imwallet

echo ""
echo "✅ 初始化完成!"
echo ""
echo "📋 后续步骤:"
echo "   1. 编辑环境变量:  sudo vim $APP_DIR/.env.production"
echo "   2. 首次部署:      bash deploy.sh 1.0.0"
echo "   3. 查看服务状态:  sudo systemctl status imwallet"
echo "   4. 查看实时日志:  sudo journalctl -u imwallet -f"