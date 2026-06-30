#!/usr/bin/env bash
# rs-wallet 升级脚本
# 用法: sudo bash upgrade.sh <版本号>
# 示例: sudo bash upgrade.sh v0.3.0
#       sudo bash upgrade.sh latest
#
# 仅替换二进制，保留 env/keys/config 不动
# 如果新版本有配置结构变更，会自动提示

set -euo pipefail

VERSION="${1:-}"
if [ -z "${VERSION}" ]; then
    echo "Usage: sudo bash upgrade.sh <version>"
    echo "Example: sudo bash upgrade.sh v0.3.0"
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

# 2. 备份当前二进制
echo "Backing up current binary ..."
cp "${INSTALL_DIR}/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}.bak"

# 3. 下载新版本二进制
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

# 4. 停止服务
echo "Stopping rs-wallet service ..."
systemctl stop "${SERVICE_NAME}" || true

# 5. 替换二进制（迁移 SQL 已内嵌，无需更新外部文件）
echo "Replacing binary ..."
cp "${TMPDIR}/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
chown rs-wallet:rs-wallet "${INSTALL_DIR}/${BIN_NAME}"

# 5b. 更新示例配置（仅供参考，不影响运行配置）
if [ -f "${TMPDIR}/config.toml.example" ]; then
    cp "${TMPDIR}/config.toml.example" "${INSTALL_DIR}/config.toml.example"
    echo "Updated config.toml.example (for reference only)"
fi

# 5c. 检查 env 文件是否缺少新增的环境变量
ENV_FILE="${INSTALL_DIR}/env"
if [ -f "${ENV_FILE}" ]; then
    MISSING_VARS=""
    
    # 检查 ADMIN_ROUTE_PREFIX（v0.3.0 新增）
    if ! grep -q "^ADMIN_ROUTE_PREFIX=" "${ENV_FILE}" 2>/dev/null; then
        MISSING_VARS="${MISSING_VARS}  ADMIN_ROUTE_PREFIX=vault  # 管理路由前缀\n"
    fi
    
    # 检查 PORT 是否还是旧值 3000（v0.3.0 改为 9000）
    OLD_PORT=$(grep "^PORT=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2)
    if [ "${OLD_PORT}" = "3000" ]; then
        echo "NOTE: PORT in env file is 3000 (old default). New default is 9000."
        echo "      If you want to use the new port, update PORT=9000 in ${ENV_FILE}"
    fi
    
    if [ -n "${MISSING_VARS}" ]; then
        echo ""
        echo "=== New environment variables available ==="
        echo "Add these to ${ENV_FILE} if needed:"
        echo "${MISSING_VARS}"
        echo "(Defaults in config.toml will be used if not set in env)"
        echo ""
    fi
fi

# 6. 确保 keys 目录权限正确
chown -R rs-wallet:rs-wallet "${INSTALL_DIR}/keys"
chmod 700 "${INSTALL_DIR}/keys"
chmod 600 "${INSTALL_DIR}/keys/rsa_private.pem" 2>/dev/null || true
chmod 644 "${INSTALL_DIR}/keys/rsa_public.pem" 2>/dev/null || true

# 7. 清理临时目录
rm -rf "${TMPDIR}"

# 8. 重启服务
echo "Starting rs-wallet service ..."
systemctl start "${SERVICE_NAME}"

# 9. 等待并确认
sleep 2
if systemctl is-active --quiet "${SERVICE_NAME}"; then
    echo "=== rs-wallet upgraded to ${VERSION} ==="
else
    echo "ERROR: rs-wallet failed to start after upgrade"
    echo "Rolling back to previous binary ..."
    cp "${INSTALL_DIR}/${BIN_NAME}.bak" "${INSTALL_DIR}/${BIN_NAME}"
    systemctl start "${SERVICE_NAME}"
    sleep 2
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        echo "Rolled back successfully. Service is running with previous version."
    else
        echo "Rollback also failed. Check logs: journalctl -u rs-wallet -n 50 --no-pager"
    fi
    exit 1
fi

echo "View logs: journalctl -u rs-wallet -f"
