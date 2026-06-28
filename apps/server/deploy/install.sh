#!/usr/bin/env bash
# rs-wallet 首次安装脚本（systemd 方式）
# 用法: sudo bash install.sh [版本号]
# 示例: sudo bash install.sh v0.1.0
#       sudo bash install.sh latest
#
# 仅用于首次部署，升级请用 upgrade.sh
#
# 注意：自 v0.2.0 起，迁移 SQL 已内嵌到二进制中（#[migrations] 宏），
# 不再依赖外部 migrations/ 目录。该目录仅作为参考保留。

set -euo pipefail

VERSION="${1:-latest}"
REPO="sixinyiyu/imwallet"
INSTALL_DIR="/opt/rs-wallet"
BIN_NAME="rs-wallet"

echo "=== Installing rs-wallet ${VERSION} ==="

# 1. 检查是否已安装
if [ -f "${INSTALL_DIR}/${BIN_NAME}" ]; then
    echo "ERROR: rs-wallet is already installed at ${INSTALL_DIR}/${BIN_NAME}"
    echo "To upgrade, use: sudo bash upgrade.sh ${VERSION}"
    exit 1
fi

# 2. 创建用户（如果不存在）
id -u rs-wallet &>/dev/null || useradd -r -s /bin/false rs-wallet

# 3. 创建安装目录
mkdir -p "${INSTALL_DIR}/keys"

# 4. 下载二进制
if [ "${VERSION}" = "latest" ]; then
    DOWNLOAD_URL=$(curl -sL "https://api.github.com/repos/${REPO}/releases/latest" \
        | grep "browser_download_url.*x86_64-linux-musl\\.tar\\.gz" \
        | head -1 | cut -d '"' -f 4)
else
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${BIN_NAME}-${VERSION}-x86_64-linux-musl.tar.gz"
fi

if [ -z "${DOWNLOAD_URL}" ]; then
    echo "ERROR: Could not find download URL for version ${VERSION}"
    exit 1
fi

echo "Downloading ${DOWNLOAD_URL} ..."
TMPDIR=$(mktemp -d)
curl -sL "${DOWNLOAD_URL}" | tar xz -C "${TMPDIR}"

# 5. 安装二进制（迁移 SQL 已内嵌，无需外部文件）
cp "${TMPDIR}/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
chmod +x "${INSTALL_DIR}/${BIN_NAME}"

# 6. 清理临时目录
rm -rf "${TMPDIR}"

# 7. 安装 systemd unit
curl -sL "https://raw.githubusercontent.com/${REPO}/main/apps/server/deploy/rs-wallet.service" \
    -o /etc/systemd/system/rs-wallet.service

# 8. 创建 env 文件（仅首次）
if [ ! -f "${INSTALL_DIR}/env" ]; then
    cat > "${INSTALL_DIR}/env" << 'ENVFILE'
DATABASE_URL=postgresql://imwallet:CHANGE_ME@localhost:5432/imwallet
PORT=3000
SERVER_PWD=CHANGE_ME
RSA_PRIVATE_KEY_PATH=keys/rsa_private.pem
RSA_PUBLIC_KEY_PATH=keys/rsa_public.pem
ENVFILE
    echo ""
    echo "!!! Created ${INSTALL_DIR}/env — MUST edit with your actual credentials !!!"
    echo ""
fi

# 9. 设置权限
chown -R rs-wallet:rs-wallet "${INSTALL_DIR}"

# 10. 启用并启动
systemctl daemon-reload
systemctl enable rs-wallet
systemctl start rs-wallet

# 11. 确认
sleep 2
if systemctl is-active --quiet rs-wallet; then
    echo "=== rs-wallet ${VERSION} installed and running ==="
else
    echo "ERROR: rs-wallet failed to start"
    echo "Check logs: journalctl -u rs-wallet -n 50 --no-pager"
    echo "Make sure DATABASE_URL and SERVER_PWD are set in ${INSTALL_DIR}/env"
    exit 1
fi

echo "Check status: systemctl status rs-wallet"
echo "View logs:    journalctl -u rs-wallet -f"
echo "Upgrade:      sudo bash upgrade.sh <new_version>"
