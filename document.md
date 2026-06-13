# IMWallet 项目文档

## 项目概述

IMWallet 是一个多链去中心化钱包应用，采用前后端分离架构：

- **Server**: Express + Prisma + PostgreSQL
- **Mobile**: Expo React Native (Android/iOS)
- **部署**: 支持 Docker / PM2 / Systemd 三种方式

---

## 1. 项目结构

```
imwallet/
├── apps/
│   ├── server/          ← 后端服务
│   │   ├── src/         ← TypeScript 源码
│   │   ├── prisma/      ← 数据库 Schema + 种子脚本
│   │   ├── Dockerfile   ← Docker 构建文件
│   │   ├── ecosystem.config.js  ← PM2 配置
│   │   ├── imwallet.service     ← Systemd 服务配置
│   │   ├── deploy.sh            ← Systemd 部署脚本
│   │   ├── deploy-pm2.sh        ← PM2 部署脚本
│   │   └── setup-ec2.sh         ← EC2 初始化脚本
│   │   └── .env.example         ← 环境变量模板
│   │
│   └── mobile/          ← 移动端应用
│       ├── src/         ← React Native 源码
│       ├── plugins/     ← Expo 配置插件
│       │   └── withAbiFilter.js  ← 架构过滤+压缩+环境变量注入
│       ├── eas.json     ← EAS Build 配置
│       ├── app.json     ← Expo 应用配置
│       ├── proguard-rules.pro  ← Android 代码压缩规则
│       └── assets/      ← 图标等资源
│
├── .github/workflows/   ← CI/CD 流水线
│   ├── build-android.yml       ← Android 构建 (tag: mobile-v*)
│   ├── build-ios.yml           ← iOS 构建 (tag: mobile-v*)
│   ├── build-server.yml        ← Systemd 构建 (tag: server-v*)
│   ├── build-server-pm2.yml    ← PM2 构建 (tag: server-pm2-v*)
│   ├── build-server-docker.yml ← Docker 构建 (tag: server-docker-v*)
│   ├── test-mobile.yml         ← Mobile 测试
│   └── test-server.yml         ← Server 测试
│
├── package.json          ← Monorepo 根配置 (npm workspaces)
└── document.md           ← 本文档
```

---

## 2. 环境变量配置

### 2.1 Server 端环境变量

所有敏感配置通过环境变量注入，不硬编码在代码中。

| 变量 | 说明 | 示例 |
|------|------|------|
| `PORT` | 服务端口 | `3000` |
| `NODE_ENV` | 运行环境 | `production` |
| `DATABASE_URL` | PostgreSQL 连接地址 | `postgresql://user:pass@rds-endpoint:5432/imwallet` |
| `JWT_SECRET` | JWT 签名密钥 | 随机强密码 |
| `JWT_EXPIRES_IN` | Token 过期时间 | `7d` |
| `RSA_PRIVATE_KEY` | RSA 私钥（PEM格式，`\n`转义） | `-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----` |
| `RSA_PUBLIC_KEY` | RSA 公钥（PEM格式，`\n`转义） | `-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----` |
| `SEED_PASSWORD` | 种子数据密码（damotou 初始密码） | 自定义密码 |
| `FEE_RATE` | 手续费率 | `0.005` |
| `FEE_MODE` | 手续费模式 | `EXTRA` 或 `DEDUCTED` |

> 参考 `apps/server/.env.example` 模板文件

### 2.2 Mobile 端环境变量（构建时注入）

通过 EAS 环境变量在构建时注入，打包后不可更改。

| 变量 | 说明 | 示例 |
|------|------|------|
| `API_BASE_URL` | Server API 地址 | `http://EC2公网IP:3000/api/v1` |
| `BUILD_ABI` | 目标 CPU 架构 | `arm64-v8a` / `armeabi-v7a` / `x86` / `x86_64` |
| `EAS_PROJECT_ID` | Expo 项目 ID | 从 Expo 控制台获取 |

### 2.3 GitHub Secrets 配置

在 https://github.com/sixinyiyu/imwallet/settings/secrets/actions 中配置：

| Secret | 说明 | 必须配置 |
|--------|------|---------|
| `EXPO_TOKEN` | Expo Access Token | ✅ 必须 |
| `EAS_PROJECT_ID` | Expo 项目 ID | ✅ 必须 |
| `API_BASE_URL` | Mobile 端 Server 地址 | ✅ 必须 |

> Server 端的环境变量在 EC2 上通过 `.env.production` 文件配置，不在 GitHub Secrets 中。

---

## 3. Expo 配置

### 3.1 获取 Expo Token

1. 登录 https://expo.dev （当前账号: `wdc_1990`）
2. 进入 https://expo.dev/settings/access-tokens
3. 点击 **Create Token**，命名如 `github-actions`
4. 复制 Token → 更新 GitHub Secret `EXPO_TOKEN`

> ⚠️ Token 只显示一次，复制后立即更新到 GitHub Secrets

### 3.2 获取 EAS Project ID

1. 在本地 `cd apps/mobile` 后运行:
   ```bash
   eas login    # 用新账号登录
   eas init     # 初始化项目
   ```
2. 输出中会显示: `Project successfully linked (ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)`
3. 将此 ID 更新到 GitHub Secret `EAS_PROJECT_ID`

> 或在 Expo 控制台 https://expo.dev/accounts/wdc_1990/projects/imwallet/settings 查看

### 3.3 eas.json 构建配置

```json
{
  "build": {
    "production-arm64":  { "android": {"buildType": "apk"}, "env": {"BUILD_ABI": "arm64-v8a"} },
    "production-armv7":  { "android": {"buildType": "apk"}, "env": {"BUILD_ABI": "armeabi-v7a"} },
    "production-x86":    { "android": {"buildType": "apk"}, "env": {"BUILD_ABI": "x86"} },
    "production-x86_64": { "android": {"buildType": "apk"}, "env": {"BUILD_ABI": "x86_64"} }
  }
}
```

### 3.4 构建优化（withAbiFilter 插件）

`apps/mobile/plugins/withAbiFilter.js` 在构建时自动处理：

| 功能 | 说明 |
|------|------|
| `ndk.abiFilters` | 按 BUILD_ABI 过滤 CPU 架构，减小包体积 |
| `minifyEnabled` | R8 代码压缩（移除未使用代码） |
| `shrinkResources` | 资源压缩（移除未使用资源） |
| `reactNativeArchitectures` | 只编译目标架构的 native 库 |
| `API_BASE_URL` 注入 | 写入 app.json extra.apiBaseUrl |
| `EAS_PROJECT_ID` 注入 | 写入 app.json extra.eas.projectId |

---

## 4. 构建与部署

### 4.1 触发构建

所有构建通过推送特定格式的 Git tag 触发：

| 目标 | Tag 格式 | 示例 |
|------|----------|------|
| **Android APK** | `mobile-v*` | `mobile-v1.0.0` |
| **iOS** | `mobile-v*` | `mobile-v1.0.0` |
| **Server (Systemd)** | `server-v*` | `server-v1.0.0` |
| **Server (PM2)** | `server-pm2-v*` | `server-pm2-v1.0.0` |
| **Server (Docker)** | `server-docker-v*` | `server-docker-v1.0.0` |

触发命令：

```bash
# Android/iOS 构建
git tag mobile-v1.0.0
git push origin mobile-v1.0.0

# Server - Systemd 部署
git tag server-v1.0.0
git push origin server-v1.0.0

# Server - PM2 部署
git tag server-pm2-v1.0.0
git push origin server-pm2-v1.0.0

# Server - Docker 部署
git tag server-docker-v1.0.0
git push origin server-docker-v1.0.0
```

删除旧 tag 重新触发：

```bash
git tag -d <tag>
git push origin :refs/tags/<tag>
git tag <tag> HEAD
git push origin <tag>
```

### 4.2 Android 构建产物

构建完成后在 GitHub Release 页面下载：

| 文件 | 大约体积 | 适用设备 |
|------|----------|----------|
| `imwallet-{ver}-arm64-v8a.apk` | ~25-32MB | 现代手机（主流） |
| `imwallet-{ver}-armeabi-v7a.apk` | ~20-25MB | 旧款手机 |
| `imwallet-{ver}-x86.apk` | ~25-35MB | 模拟器/x86 设备 |
| `imwallet-{ver}-x86_64.apk` | ~25-35MB | 模拟器/x86_64 设备 |

### 4.3 Server 三种部署方式

#### 方式一：Systemd（推荐生产环境）

**首次初始化 EC2：**

```bash
ssh ubuntu@EC2公网IP
git clone https://github.com/sixinyiyu/imwallet.git
cd imwallet/apps/server
sudo bash setup-ec2.sh
# 第一次会生成 .env.production 模板，需手动填写
sudo vim /opt/imwallet-server/.env.production
# 填写完成后再次执行
sudo bash setup-ec2.sh
```

**部署更新：**

```bash
bash deploy.sh 1.0.0
```

**运维命令：**

```bash
sudo systemctl status imwallet     # 查看状态
sudo journalctl -u imwallet -f     # 实时日志
sudo systemctl restart imwallet    # 重启
sudo systemctl stop imwallet       # 停止
```

#### 方式二：PM2（适合快速部署/开发环境）

**首次初始化：**

```bash
ssh ubuntu@EC2公网IP
sudo npm install -g pm2

# 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 创建应用目录
sudo mkdir -p /opt/imwallet-server /var/log/imwallet
sudo chown $(whoami):$(whoami) /opt/imwallet-server /var/log/imwallet

# 配置环境变量
cp .env.example /opt/imwallet-server/.env.production
vim /opt/imwallet-server/.env.production
```

**部署更新：**

```bash
bash deploy-pm2.sh 1.0.0
```

**运维命令：**

```bash
pm2 status                # 查看状态
pm2 logs imwallet         # 实时日志
pm2 restart imwallet      # 重启
pm2 stop imwallet         # 停止
pm2 monit                 # 监控面板
pm2 save                  # 保存进程列表

# 设置开机自启
pm2 startup
pm2 save
```

#### 方式三：Docker（适合容器化环境）

**部署：**

```bash
# 登录 GHCR
docker login ghcr.io

# 拉取镜像
docker pull ghcr.io/sixinyiyu/imwallet/imwallet-server:latest

# 运行容器
docker run -d \
  --name imwallet-server \
  --env-file .env.production \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/sixinyiyu/imwallet/imwallet-server:latest
```

**运维命令：**

```bash
docker logs imwallet-server -f    # 实时日志
docker restart imwallet-server    # 重启
docker stop imwallet-server       # 停止
docker ps                         # 查看运行容器
```

---

## 5. 数据库

### 5.1 AWS RDS 配置

- 引擎: PostgreSQL 16
- 实例: 已创建，EC2 可正常访问
- `DATABASE_URL` 格式: `postgresql://用户名:密码@RDS端点:5432/数据库名`

### 5.2 数据库迁移

首次部署或升级时执行：

```bash
cd /opt/imwallet-server
npx prisma migrate deploy
```

### 5.3 种子数据

首次部署后初始化数据：

```bash
cd /opt/imwallet-server
SEED_PASSWORD=你的密码 npx prisma db seed
```

种子数据包含：
- damotou 用户 (ADMIN 角色, ACTIVE 状态)
- USDT + TRX 代币
- damotou 钱包 (USDT/TRX 余额各 90,000,000)
- 法币汇率 (USD/CNY/EUR/JPY)

---

## 6. 安全注意事项

### 6.1 RSA 密钥管理

- **生产环境必须设置** `RSA_PRIVATE_KEY` 和 `RSA_PUBLIC_KEY` 环境变量
- 否则每次容器/服务重启会自动生成新密钥，导致客户端缓存的公钥失效
- 生成密钥对：
  ```bash
  ssh-keygen -t rsa -b 2048 -m PEM -f private.pem
  openssl rsa -in private.pem -pubout -out public.pem
  ```
- 在 `.env.production` 中设置（`\n` 需转义为 `\\n`）

### 6.2 已排除的敏感文件

以下文件已从 git 中移除，不会泄露：

| 文件 | 原因 |
|------|------|
| `private.pem` / `public.pem` | RSA 密钥，改为环境变量 |
| `.env` / `.env.test` | 含数据库凭据 |
| `check-users.ts` / `reset-pwd.ts` | 含硬编码密码 |

### 6.3 .gitignore 规则

```
.env
.env.*
!.env.example
*.pem          ← RSA 密钥文件
node_modules/
```

### 6.4 Workflow 权限

所有 workflow 使用最小权限原则：

| Workflow | permissions |
|----------|-------------|
| build-android | `contents: write` (仅 release 需要) |
| build-ios | `contents: read` |
| build-server (Systemd) | `contents: write` (上传 Release) |
| build-server-pm2 | `contents: write` (上传 Release) |
| build-server-docker | `contents: read` + `packages: write` |
| test-mobile | `contents: read` |
| test-server | `contents: read` |

---

## 7. 功能需求索引

| # | 功能 | 状态 |
|---|------|------|
| 1 | 登录错误提示优化 | ✅ 已实现 |
| 2 | 首次登录无钱包→强制创建 | ✅ 已实现 |
| 3 | 内置种子数据 (damotou/代币) | ✅ 已实现 |
| 4 | 用户角色与权限管理 | ✅ 已实现 |
| 5 | 通知/消息系统 | ✅ 已实现 |
