#!/usr/bin/env bash
# rs-wallet 升级脚本
# 用法: sudo bash upgrade.sh <版本号>
# 示例: sudo bash upgrade.sh v0.1.0
#       sudo bash upgrade.sh latest
#
# 仅替换二进制和迁移文件，保留 env/keys/config 不动

set -euo pipefail

VERSION="${1:-}"
if [ -z "${VERSION}" ]; then
    echo "Usage: sudo bash upgrade.sh <version>"
    echo "Example: sudo bash upgrade.sh v0.1.0"
    echo "         sudo bash upgrade.sh latest"
    exit 1
fi

REPO="sixinyiyu/imwallet"
INSTALL_DIR="/opt/rs-wallet"
BIN_NAME="rs-wallet"
SERVICE_NAME="rs-wallet"

echo "=== Upgrading rs-wallet to ${VERSION} ==="

# 1. 检查当前服务是否运行
if ! systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
    echo "WARNING: rs-wallet service is not currently running"
fi

# 2. 下载新版本二进制
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

# 3. 停止服务
echo "Stopping rs-wallet service ..."
systemctl stop "${SERVICE_NAME}" || true

# 4. 替换二进制
echo "Replacing binary ..."
cp "${TMPDIR}/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
chown rs-wallet:rs-wallet "${INSTALL_DIR}/${BIN_NAME}"

# 5. 更新迁移文件（仅覆盖，不删除新增的）
echo "Updating migration files ..."
cp "${TMPDIR}/V1_init.sql" "${INSTALL_DIR}/migrations/V1_init.sql" 2>/dev/null || true
# 如果 tar 包中有更多迁移文件，一并复制
find "${TMPDIR}" -name 'V*.sql' -exec cp {} "${INSTALL_DIR}/migrations/" \; 2>/dev/null || true
chown -R rs-wallet:rs-wallet "${INSTALL_DIR}/migrations"

# 6. 清理临时目录
rm -rf "${TMPDIR}"

# 7. 重启服务
echo "Starting rs-wallet service ..."
systemctl start "${SERVICE_NAME}"

# 8. 等待并确认
sleep 2
if systemctl is-active --quiet "${SERVICE_NAME}"; then
    CURRENT_VER=$(curl -s http://localhost:3000/health 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    echo "=== rs-wallet upgraded to ${VERSION} (running: ${CURRENT_VER}) ==="
else
    echo "ERROR: rs-wallet failed to start after upgrade"
    echo "Check logs: journalctl -u rs-wallet -n 50 --no-pager"
    exit 1
fi

echo "View logs: journalctl -u rs-wallet -f"