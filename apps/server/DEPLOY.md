# rs-wallet 部署与升级指南

## 前置条件

- PostgreSQL 16+（需提前创建数据库和用户）
- 确保数据库连接、服务密码等敏感配置通过环境变量注入，勿硬编码

---

## 方式一：Docker 单容器

### 部署

```bash
# 拉取镜像
docker pull ghcr.io/sixinyiyu/rs-wallet:latest

# 运行（需先准备好 PostgreSQL）
docker run -d \
  --name rs-wallet \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://imwallet:YOUR_PASSWORD@db-host:5432/imwallet \
  -e SERVER_PWD=YOUR_SERVICE_PASSWORD \
  -e RUST_BACKTRACE=1 \
  -v rs-wallet-keys:/opt/rs-wallet/keys \
  ghcr.io/sixinyiyu/rs-wallet:latest
```

### 升级

```bash
docker pull ghcr.io/sixinyiyu/rs-wallet:latest
docker stop rs-wallet
docker rm rs-wallet
# 重新执行上述 docker run 命令（保持相同参数）
```

---

## 方式二：docker-compose

### 部署

```bash
# 1. 设置环境变量
export DB_PASSWORD=YOUR_PASSWORD

# 2. 启动（含 PostgreSQL）
docker compose up -d

# 3. 查看状态
docker compose ps
docker compose logs -f app
```

### 升级

```bash
# 1. 拉取最新镜像
docker compose pull

# 2. 重建并启动（数据库容器保持不变）
docker compose up -d --build app

# 3. 确认
docker compose logs -f app
```

---

## 方式三：二进制 + systemd

> Linux 二进制为 musl 静态链接，零动态依赖，适用于所有 x86_64 发行版
> （Ubuntu / Debian / Linux Mint / Pop!_OS / Amazon Linux / RHEL / CentOS / Fedora / Rocky / Alma 等）

### 部署

```bash
# 方式 A：使用安装脚本（推荐）
curl -sL https://github.com/sixinyiyu/rs-wallet/releases/latest/download/rs-wallet-latest-x86_64-linux-musl.tar.gz | tar xz
sudo bash install.sh latest

# 方式 B：手动安装
# 1. 下载二进制
curl -sL https://github.com/sixinyiyu/rs-wallet/releases/download/v0.1.0/rs-wallet-v0.1.0-x86_64-linux-musl.tar.gz | tar xz

# 2. 创建用户和目录
sudo useradd -r -s /bin/false rs-wallet
sudo mkdir -p /opt/rs-wallet/keys /opt/rs-wallet/migrations

# 3. 安装文件
sudo cp rs-wallet /opt/rs-wallet/
sudo cp V1_init.sql /opt/rs-wallet/migrations/
sudo cp rs-wallet.service /etc/systemd/system/
sudo chmod +x /opt/rs-wallet/rs-wallet

# 4. 配置环境变量
sudo tee /opt/rs-wallet/env << 'EOF'
DATABASE_URL=postgresql://imwallet:YOUR_PASSWORD@localhost:5432/imwallet
PORT=3000
SERVER_PWD=YOUR_SERVICE_PASSWORD
RUST_BACKTRACE=1
RSA_PRIVATE_KEY_PATH=keys/rsa_private.pem
RSA_PUBLIC_KEY_PATH=keys/rsa_public.pem
EOF

# 5. 复制示例配置（可选，用于本地调试）
sudo cp config.toml.example /opt/rs-wallet/config.toml

# 6. 设置权限并启动
sudo chown -R rs-wallet:rs-wallet /opt/rs-wallet
sudo systemctl daemon-reload
sudo systemctl enable rs-wallet
sudo systemctl start rs-wallet

# 7. 确认
sudo systemctl status rs-wallet
sudo journalctl -u rs-wallet -f
```

---

## 方式四：Windows 二进制

### 部署

```powershell
# 1. 下载并解压
Expand-Archive rs-wallet-v0.1.0-x86_64-windows.zip -DestinationPath rs-wallet
cd rs-wallet

# 2. 编辑配置
# 复制示例配置并修改数据库连接等
Copy-Item config.toml.example config.toml
# 编辑 config.toml 中的 [database].url、[service].password 等

# 3. 运行
.
s-wallet.exe
```

### 升级

```powershell
# 1. 下载新版本并解压
Expand-Archive rs-wallet-v0.2.0-x86_64-windows.zip -DestinationPath rs-wallet-new

# 2. 替换二进制（保留原有 config.toml 和 keys 目录）
Copy-Item rs-wallet-new\rs-wallet.exe rs-wallet\rs-wallet.exe

# 3. 重新运行
.
s-wallet.exe
```

### 注册为 Windows 服务（可选）

使用 [nssm](https://nssm.cc/) 将二进制注册为 Windows 服务：

```powershell
# 安装 nssm 后执行
nssm install rs-wallet C:\rs-wallet\rs-wallet.exe
nssm set rs-wallet AppDirectory C:\rs-wallet
nssm set rs-wallet DisplayName "rs-wallet service"
nssm set rs-wallet Start SERVICE_AUTO_START
nssm start rs-wallet
```

### 升级

```bash
# 使用升级脚本（推荐）
sudo bash upgrade.sh v0.2.0
# 或升级到最新版
sudo bash upgrade.sh latest

# 手动升级
# 1. 下载新版本二进制
curl -sL https://github.com/sixinyiyu/rs-wallet/releases/download/v0.2.0/rs-wallet-v0.2.0-x86_64-linux-musl.tar.gz | tar xz

# 2. 替换二进制
sudo cp rs-wallet /opt/rs-wallet/rs-wallet
sudo chown rs-wallet:rs-wallet /opt/rs-wallet/rs-wallet

# 3. 重启服务
sudo systemctl restart rs-wallet

# 4. 确认
sudo systemctl status rs-wallet
sudo journalctl -u rs-wallet -f
```

---

## 流水线触发说明

| 流水线 | 文件 | 触发方式 | 用途 |
|--------|------|----------|------|
| CI | `.github/workflows/ci.yml` | push/PR 到 main 自动触发 | 代码质量门禁（fmt/clippy/build/test） |
| Docker | `.github/workflows/docker.yml` | GitHub Actions 页面手动触发 | 构建镜像推送到 ghcr.io |
| Release | `.github/workflows/release.yml` | GitHub Actions 页面手动触发 | 构建 Linux + Windows 二进制，发布到 GitHub Releases |

### 手动触发步骤

1. 进入 GitHub 仓库 → Actions 标签页
2. 选择对应流水线（如 "Build Docker Image"）
3. 点击 "Run workflow"
4. 填写参数（如镜像 tag 或版本号）
5. 点击 "Run workflow" 确认

---

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | config.toml 中的值 |
| `PORT` | 服务监听端口 | 3000 |
| `SERVER_PWD` | 服务配置密码 | config.toml 中的值 |
| `RUST_BACKTRACE` | 异常时是否输出堆栈 | 建议设为 1 |
| `RSA_PRIVATE_KEY_PATH` | RSA 私钥文件路径 | keys/rsa_private.pem |
| `RSA_PUBLIC_KEY_PATH` | RSA 公钥文件路径 | keys/rsa_public.pem |

### RSA 密钥

- 首次启动时，如果 `keys/` 目录下没有 PEM 文件，服务会自动生成 2048 位密钥对并保存
- 后续启动从文件加载，不会重新生成
- **生产环境建议提前生成密钥对并妥善保管私钥，勿提交到仓库**

### 数据库迁移

- 服务启动时自动执行 flyway 迁移（`migrations/V1_init.sql`）
- 迁移是幂等的，可安全重复执行