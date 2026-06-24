# 服务端 Rust 重构合并方案：rs-wallet 合入 imwallet 仓库

> 版本：v1.0  
> 日期：2026-06-24  
> 作者：QAgent  

---

## 1. 背景与现状

### 1.1 两个仓库概况

| 仓库 | 地址 | 语言 | 说明 |
|------|------|------|------|
| **imwallet** | `github.com/sixinyiyu/imwallet` | TypeScript (server) + React Native (mobile) | 当前主仓库，npm workspace monorepo |
| **rs-wallet** | `github.com/sixinyiyu/rs-wallet` | Rust (axum + rbatis) | 新版服务端，独立仓库 |

### 1.2 当前 imwallet 仓库结构

```
imwallet/
├── apps/
│   ├── server/          ← Node.js 服务端（即将被替换）
│   │   ├── src/         ← Express + Prisma + TypeScript
│   │   ├── prisma/      ← Schema + init.sql + migrations
│   │   ├── Dockerfile
│   │   ├── deploy.sh / ecosystem.config.js / imwallet.service
│   │   └── package.json
│   └── mobile/          ← React Native 客户端（不变）
│       ├── src/
│       ├── app.json
│       └── package.json
├── scripts/             ← local.ps1 本地开发脚本
├── docs/                ← 项目文档
├── docker-compose.yml   ← PostgreSQL + Node.js server
├── package.json         ← npm workspace 根配置
└── .gitignore
```

### 1.3 rs-wallet 仓库结构

```
rs-wallet/
├── src/                 ← Rust 源码 (axum + rbatis)
│   ├── main.rs
│   ├── config/
│   ├── db/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── chain/
│   └── errors.rs
├── migrations/          ← V1_init.sql（flyway 驱动）
├── deploy/              ← install.sh / upgrade.sh / rs-wallet.service
├── .github/workflows/   ← ci.yml / docker.yml / release.yml
├── Cargo.toml + Cargo.lock
├── config.toml          ← 运行时配置
├── Dockerfile           ← 多阶段构建 → distroless
├── docker-compose.yml   ← PostgreSQL + Rust app
├── .env.example
├── DEPLOY.md
└── .gitignore
```

### 1.4 合并目标

将 rs-wallet 合入 imwallet 仓库，替换 `apps/server/` 目录下的 Node.js 服务端，保持 monorepo 结构：

```
imwallet/（合并后）
├── apps/
│   ├── server/          ← Rust 服务端（替换原 Node.js）
│   │   ├── src/         ← Rust 源码
│   │   ├── migrations/  ← flyway SQL
│   │   ├── deploy/      ← 部署脚本
│   │   ├── Cargo.toml + Cargo.lock
│   │   ├── config.toml
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   └── DEPLOY.md
│   └── mobile/          ← 不变
├── scripts/
├── docs/
├── docker-compose.yml   ← 改为指向 Rust server
├── package.json         ← 移除 server workspace
└── .github/workflows/   ← 合并后的 CI/CD
```

---

## 2. 合并策略：git subtree

### 2.1 为什么用 subtree 而不是 submodule？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **git submodule** | 保持两个仓库独立，更新方便 | 克隆需额外步骤，目录嵌套 `.git`，CI 复杂，团队协作门槛高 |
| **git subtree** | 合入后就是普通目录，无额外操作，CI 简单 | 合入时需一次性操作，后续从上游同步需 subtree pull |
| **手动复制** | 最简单 | 丢失 git 历史，无法追踪 rs-wallet 的演进 |

**选择 subtree**：合入后 `apps/server/` 就是普通目录，对 CI、开发者、IDE 都透明。rs-wallet 的完整 git 历史也会保留在 imwallet 仓库中。

### 2.2 操作步骤

#### Step 0：准备工作 — 在 imwallet 仓库创建新分支

```bash
cd D:/QAX_Fabric_workspace/imwallet

# 确保当前分支干净（先处理未提交的变更）
git stash

# 创建合并分支
git checkout -b refactor/server-rust

# 恢复暂存的变更（如果需要）
git stash pop
```

#### Step 1：先提交当前未提交的变更

当前 imwallet 有未提交的修改（notificationService 等），先提交到新分支：

```bash
cd D:/QAX_Fabric_workspace/imwallet

git add docs/notification-refactor-plan.md
git add apps/server/src/utils/likeEscape.ts
git add apps/server/src/services/notificationService.ts
git add apps/server/src/services/rechargeService.ts
git add apps/server/src/services/transactionService.ts
git add apps/server/src/services/walletService.ts
git add docs/rust-migration-feasibility.md

git commit -m "chore: 提交当前未提交的变更，准备 Rust 合入"
```

#### Step 2：删除旧的 Node.js server 目录

```bash
cd D:/QAX_Fabric_workspace/imwallet

# 删除 apps/server 下所有 Node.js 相关内容
git rm -r apps/server/

git commit -m "refactor: 删除 Node.js 服务端，准备合入 Rust 版本"
```

> ⚠️ 注意：`apps/server/prisma/` 目录中的 `init.sql` 和 `schema.prisma` 是数据库定义，rs-wallet 的 `migrations/V1_init.sql` 已经包含了等价的数据库初始化逻辑，所以不需要保留旧的 prisma 文件。

#### Step 3：添加 rs-wallet 为 remote 并 subtree 合入

```bash
cd D:/QAX_Fabric_workspace/imwallet

# 添加 rs-wallet 仓库为 remote
git remote add rs-wallet https://github.com/sixinyiyu/rs-wallet.git

# 拉取 rs-wallet 的所有历史
git fetch rs-wallet

# 将 rs-wallet 的内容合入 apps/server/ 目录（保留完整历史）
git subtree add --prefix=apps/server rs-wallet/main --squash

# 合入后的 commit message 会自动生成，可以修改：
# "Merge rs-wallet into apps/server (Rust server replaces Node.js)"
```

> `--squash` 参数：将 rs-wallet 的所有历史压缩为一个 commit 合入，避免 imwallet 的历史被大量 rs-wallet 的开发细节污染。如果需要保留 rs-wallet 的逐条历史，去掉 `--squash` 即可。

#### Step 4：调整合入后的目录结构

subtree 合入后，`apps/server/` 的内容就是 rs-wallet 仓库的根目录内容，结构如下：

```
apps/server/
├── .cache/              ← Rust 构建缓存（应加入 .gitignore）
├── .github/             ← rs-wallet 的 CI workflows（需移到根目录）
├── deploy/              ← 部署脚本（OK，保留在此）
├── migrations/          ← flyway SQL（OK，保留在此）
├── output/              ← 构建输出（应加入 .gitignore）
├── src/                 ← Rust 源码（OK，保留在此）
├── target/              ← Rust 编译产物（应加入 .gitignore）
├── Cargo.toml + Cargo.lock
├── config.toml
├── Dockerfile
├── docker-compose.yml   ← 需要移到根目录或删除（根目录已有）
├── .env.example
├── DEPLOY.md
└── .gitignore           ← 需要合并到根目录 .gitignore
```

需要做以下调整：

**4a. 移动 CI workflows 到根目录**

```bash
cd D:/QAX_Fabric_workspace/imwallet

# rs-wallet 的 CI workflows 在 apps/server/.github/workflows/
# 需要移到根目录 .github/workflows/（与 imwallet 现有的 workflows 合并）

# 先查看 imwallet 根目录是否已有 .github
ls .github/workflows/ 2>/dev/null || echo "不存在"

# 移动 rs-wallet 的 workflows 到根目录
mkdir -p .github/workflows
mv apps/server/.github/workflows/ci.yml .github/workflows/server-ci.yml
mv apps/server/.github/workflows/docker.yml .github/workflows/server-docker.yml
mv apps/server/.github/workflows/release.yml .github/workflows/server-release.yml

# 删除 apps/server/.github 目录（已移走）
rm -rf apps/server/.github

git add .github/workflows/
git rm -r apps/server/.github
```

**4b. 删除 apps/server/ 下不应存在的目录**

```bash
cd D:/QAX_Fabric_workspace/imwallet

# 删除构建产物和缓存目录（已在 .gitignore 中，但 subtree 可能带入）
rm -rf apps/server/.cache
rm -rf apps/server/output
rm -rf apps/server/target

# 删除 apps/server/docker-compose.yml（根目录已有，且需要改写）
rm apps/server/docker-compose.yml

git add -A
```

**4c. 合并 .gitignore**

rs-wallet 的 `.gitignore` 内容：
```
/target
.env
*.log
*.swp
*.swo
*~
.DS_Store
output/
.clinerules
```

需要将这些规则合并到 imwallet 根目录的 `.gitignore` 中，并删除 `apps/server/.gitignore`：

```bash
cd D:/QAX_Fabric_workspace/imwallet

# 删除 apps/server/.gitignore（规则合并到根目录）
rm apps/server/.gitignore

# 编辑根目录 .gitignore，追加 Rust 相关规则
# 在文件末尾添加：
#   # Rust server (apps/server)
#   apps/server/target/
#   apps/server/.cache/
#   apps/server/output/
```

**4d. 提交目录调整**

```bash
cd D:/QAX_Fabric_workspace/imwallet

git add -A
git commit -m "refactor: 调整 Rust server 目录结构，移动 CI workflows，合并 .gitignore"
```

#### Step 5：改写根目录配置文件

**5a. 改写 `package.json` — 移除 server workspace**

```bash
cd D:/QAX_Fabric_workspace/imwallet
```

将 `package.json` 改为：

```json
{
  "name": "imwallet",
  "version": "0.2.0",
  "private": true,
  "description": "多链去中心化钱包 - 私有链钱包应用",
  "workspaces": [
    "apps/mobile"
  ],
  "scripts": {
    "local": "pwsh -File scripts/local.ps1 start",
    "local:server": "pwsh -File scripts/local.ps1 server",
    "local:mobile": "pwsh -File scripts/local.ps1 mobile",
    "local:stop": "pwsh -File scripts/local.ps1 stop",
    "local:status": "pwsh -File scripts/local.ps1 status",
    "dev:mobile": "npm run start --workspace=apps/mobile",
    "build:server": "cd apps/server && cargo build --release",
    "test:server": "cd apps/server && cargo test --bin rs-wallet",
    "lint:server": "cd apps/server && cargo fmt -- --check && cargo clippy -- -D warnings",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

关键变化：
- `workspaces` 只保留 `apps/mobile`（server 不再是 npm workspace）
- 删除 `dev:server`（不再用 npm run dev）
- 新增 `build:server` / `test:server` / `lint:server`（cargo 命令）
- 删除 `db:generate` / `db:init`（不再用 Prisma）

**5b. 改写 `docker-compose.yml` — 指向 Rust server**

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: imwallet-db
    environment:
      POSTGRES_USER: imwallet
      POSTGRES_PASSWORD: imwallet_dev
      POSTGRES_DB: imwallet
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U imwallet"]
      interval: 5s
      timeout: 5s
      retries: 5

  server:
    build:
      context: ./apps/server
      dockerfile: Dockerfile
    container_name: imwallet-server
    environment:
      DATABASE_URL: postgresql://imwallet:imwallet_dev@postgres:5432/imwallet
      PORT: 3000
      SERVER_PWD: dev_server_pwd
      RUST_BACKTRACE: 1
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - rs-wallet-keys:/opt/rs-wallet/keys
    restart: unless-stopped

volumes:
  pgdata:
  rs-wallet-keys:
```

关键变化：
- `context` 改为 `./apps/server`（Rust 代码位置）
- 环境变量改为 Rust 版本的配置（`SERVER_PWD`, `RUST_BACKTRACE`）
- 删除 `NODE_ENV`、`JWT_SECRET`（Rust 版不需要）
- 删除源码挂载卷（Rust 需编译，不能热挂载）
- 新增 `rs-wallet-keys` 卷（RSA 密钥持久化）

**5c. 改写 `scripts/local.ps1` — Rust server 启动方式**

核心改动：`Start-Server` 函数从 `npm run dev` 改为 `cargo run`：

```powershell
# 原来的 Start-Server 函数中：
# $proc = Start-Process -FilePath "pwsh" `
#     -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\apps\server'; npm run dev" `
#     -WindowStyle Hidden -PassThru

# 改为：
$proc = Start-Process -FilePath "pwsh" `
    -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\apps\server'; cargo run" `
    -WindowStyle Hidden -PassThru
```

> 注意：`cargo run` 首次编译较慢（几分钟），后续增量编译很快。开发阶段也可以用 `cargo watch -x run`（需安装 cargo-watch）实现热重载。

**5d. 提交配置改写**

```bash
cd D:/QAX_Fabric_workspace/imwallet

git add package.json docker-compose.yml scripts/local.ps1
git commit -m "refactor: 改写根配置，server 从 Node.js 切换到 Rust"
```

#### Step 6：改写 CI workflows

将 rs-wallet 的 3 个 workflow 与 imwallet 现有的 workflow 合并。

**6a. `server-ci.yml` — Rust 服务端 CI**

```yaml
# .github/workflows/server-ci.yml
name: Server CI (Rust)

on:
  push:
    branches: [main]
    paths: ['apps/server/**']
  pull_request:
    branches: [main]
    paths: ['apps/server/**']

jobs:
  check:
    name: Lint & Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            apps/server/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('apps/server/Cargo.lock') }}
          restore-keys: ${{ runner.os }}-cargo-

      - name: fmt check
        working-directory: apps/server
        run: cargo fmt -- --check

      - name: clippy
        working-directory: apps/server
        run: cargo clippy -- -D warnings

      - name: build
        working-directory: apps/server
        run: cargo build --release

      - name: test
        working-directory: apps/server
        run: cargo test --bin rs-wallet
```

关键变化：
- 添加 `paths: ['apps/server/**']` 过滤，只有 server 目录变更才触发
- 所有 `working-directory: apps/server` 指定 Rust 项目目录
- cache path 改为 `apps/server/target`

**6b. `server-docker.yml` — Docker 镜像构建**

```yaml
# .github/workflows/server-docker.yml
name: Server Docker Image (Rust)

on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Image tag (e.g. v0.2.0, latest)"
        required: true
        default: "latest"

jobs:
  docker:
    name: Build & Push
    runs-on: ubuntu-latest
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to ghcr.io
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/sixinyiyu/imwallet-server
          tags: |
            type=raw,value=${{ inputs.tag }}
            type=sha

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: apps/server
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

关键变化：
- `context: apps/server`（Dockerfile 在 apps/server/ 下）
- 镜像名改为 `ghcr.io/sixinyiyu/imwallet-server`（统一在 imwallet 仓库下）

**6c. `server-release.yml` — 二进制发布**

```yaml
# .github/workflows/server-release.yml
name: Server Release (Rust Binary)

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Release version tag (e.g. v0.2.0)"
        required: true
        default: "v0.2.0"

jobs:
  build-linux:
    name: Build Linux x86_64 (musl static)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-unknown-linux-musl

      - name: Install musl tools
        run: sudo apt-get install -y musl-tools

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            apps/server/target
          key: linux-musl-cargo-release-${{ hashFiles('apps/server/Cargo.lock') }}
          restore-keys: linux-musl-cargo-release-

      - name: Build release binary (musl)
        working-directory: apps/server
        run: cargo build --release --target x86_64-unknown-linux-musl

      - name: Strip binary
        run: strip apps/server/target/x86_64-unknown-linux-musl/release/rs-wallet

      - name: Create release archive
        run: |
          mkdir -p dist
          cp apps/server/target/x86_64-unknown-linux-musl/release/rs-wallet dist/
          cp apps/server/migrations/V1_init.sql dist/
          cp apps/server/deploy/rs-wallet.service dist/
          cp apps/server/deploy/install.sh dist/
          cp apps/server/deploy/upgrade.sh dist/
          cp apps/server/config.toml dist/config.toml.example
          tar czf rs-wallet-${{ inputs.version }}-x86_64-linux-musl.tar.gz -C dist .

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: linux-binary
          path: rs-wallet-${{ inputs.version }}-x86_64-linux-musl.tar.gz

  build-windows:
    name: Build Windows x86_64
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            apps/server/target
          key: windows-cargo-release-${{ hashFiles('apps/server/Cargo.lock') }}
          restore-keys: windows-cargo-release-

      - name: Build release binary
        working-directory: apps/server
        run: cargo build --release

      - name: Create release archive
        shell: pwsh
        run: |
          mkdir dist
          Copy-Item apps/server/target/release/rs-wallet.exe dist/
          Copy-Item apps/server/migrations/V1_init.sql dist/
          Copy-Item apps/server/config.toml dist/config.toml.example
          Compress-Archive -Path dist/* -DestinationPath rs-wallet-${{ inputs.version }}-x86_64-windows.zip

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: windows-binary
          path: rs-wallet-${{ inputs.version }}-x86_64-windows.zip

  publish:
    name: Publish Release
    needs: [build-linux, build-windows]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ inputs.version }}
          name: rs-wallet ${version}
          files: |
            artifacts/rs-wallet-${{ inputs.version }}-x86_64-linux-musl.tar.gz
            artifacts/rs-wallet-${{ inputs.version }}-x86_64-windows.zip
          body: |
            ## rs-wallet ${version}

            | Platform | File |
            |----------|------|
            | Linux x86_64 (musl static) | `rs-wallet-${version}-x86_64-linux-musl.tar.gz` |
            | Windows x86_64 | `rs-wallet-${version}-x86_64-windows.zip` |

            ### Linux (systemd)
            ```bash
            curl -sL https://github.com/sixinyiyu/imwallet/releases/download/${version}/rs-wallet-${version}-x86_64-linux-musl.tar.gz | tar xz
            sudo bash install.sh ${version}
            ```
```

关键变化：
- 所有 `working-directory: apps/server`
- 所有路径引用改为 `apps/server/...`
- Release 发布到 imwallet 仓库（`github.com/sixinyiyu/imwallet`）
- 部署脚本路径改为 `apps/server/deploy/...`

**6d. 提交 CI workflows**

```bash
cd D:/QAX_Fabric_workspace/imwallet

git add .github/workflows/
git commit -m "ci: 合入 Rust server CI workflows，路径改为 apps/server"
```

#### Step 7：更新 .gitignore

在根目录 `.gitignore` 末尾追加 Rust 相关规则：

```gitignore
# Rust server (apps/server)
apps/server/target/
apps/server/.cache/
apps/server/output/
apps/server/.env
```

```bash
cd D:/QAX_Fabric_workspace/imwallet

git add .gitignore
git commit -m "chore: .gitignore 追加 Rust server 相关规则"
```

#### Step 8：验证与测试

```bash
cd D:/QAX_Fabric_workspace/imwallet

# 8a. 确认 Rust server 可以编译
cd apps/server
cargo build
cargo test --bin rs-wallet
cd ../..

# 8b. 确认 mobile 客户端可以正常启动
cd apps/mobile
npx expo start --clear
cd ../..

# 8c. 确认 docker-compose 可以正常启动（需要 PostgreSQL）
docker-compose up -d

# 8d. 确认 git 状态干净
git status
```

#### Step 9：合并到 main 分支

```bash
cd D:/QAX_Fabric_workspace/imwallet

# 推送 refactor/server-rust 分支到远程
git push origin refactor/server-rust

# 在 GitHub 上创建 PR：refactor/server-rust → main
# PR 标题：refactor: 服务端从 Node.js 迁移到 Rust (rs-wallet)
# PR 描述：包含完整的迁移说明、测试结果、部署变更

# PR 审核通过后合并到 main
```

---

## 3. 合并后的仓库结构

```
imwallet/
├── apps/
│   ├── server/                  ← Rust 服务端（axum + rbatis）
│   │   ├── src/
│   │   │   ├── main.rs          ← 入口
│   │   │   ├── config/          ← 配置模块
│   │   │   ├── db/              ← 数据库连接 + query 工具
│   │   │   ├── middleware/      ← 设备认证 + 请求日志
│   │   │   ├── models/          ← 数据模型（wallet, transaction, notification 等）
│   │   │   ├── routes/          ← API 路由（wallet, transaction, notification 等）
│   │   │   ├── services/        ← 业务逻辑
│   │   │   ├── chain/           ← 链地址验证
│   │   │   └── errors.rs        ← 错误定义
│   │   ├── migrations/
│   │   │   └── V1_init.sql      ← flyway 数据库初始化 + 种子数据
│   │   ├── deploy/
│   │   │   ├── install.sh       ← systemd 首次安装
│   │   │   ├── upgrade.sh       ← systemd 升级
│   │   │   └── rs-wallet.service ← systemd unit
│   │   ├── Cargo.toml
│   │   ├── Cargo.lock
│   │   ├── config.toml          ← 运行时配置
│   │   ├── Dockerfile           ← 多阶段构建 → distroless (~10MB)
│   │   ├── .env.example
│   │   └── DEPLOY.md
│   └── mobile/                  ← React Native 客户端（不变）
│       ├── src/
│       ├── app.json
│       └── package.json
├── scripts/
│   └── local.ps1                ← 改为 cargo run 启动 server
├── docs/
│   ├── notification-refactor-plan.md
│   ├── rust-migration-feasibility.md
│   └── ...                      ← 其他文档
├── .github/workflows/
│   ├── server-ci.yml            ← Rust 服务端 CI
│   ├── server-docker.yml        ← Docker 镜像构建
│   ├── server-release.yml       ← 二进制发布
│   └── ...                      ← mobile 相关 workflows（不变）
├── docker-compose.yml           ← PostgreSQL + Rust server
├── package.json                 ← workspaces 只含 mobile
└── .gitignore                   ← 含 Rust 相关规则
```

---

## 4. CI/CD 流水线总览

合并后，imwallet 仓库的流水线按模块分离：

| 流水线 | 文件 | 触发条件 | 用途 |
|--------|------|----------|------|
| **Server CI** | `server-ci.yml` | push/PR 到 main，`apps/server/**` 变更 | Rust fmt + clippy + build + test |
| **Server Docker** | `server-docker.yml` | 手动触发 | 构建 Docker 镜像推送到 ghcr.io |
| **Server Release** | `server-release.yml` | 手动触发 | 构建 Linux + Windows 二进制，发布到 GitHub Releases |
| **Mobile CI** | 现有 mobile workflows | `apps/mobile/**` 变更 | Expo/EAS 构建（不变） |

**关键设计**：每个 workflow 用 `paths` 过滤，只有对应模块变更才触发，避免无关触发。

---

## 5. 后续从 rs-wallet 上游同步（如果需要）

如果 rs-wallet 仓库后续还有独立开发，可以用 subtree pull 同步：

```bash
cd D:/QAX_Fabric_workspace/imwallet

# 从 rs-wallet 上游拉取最新变更并合入 apps/server/
git subtree pull --prefix=apps/server rs-wallet main --squash
```

> 建议：合并完成后，rs-wallet 仓库可以归档（archive），后续所有服务端开发都在 imwallet 仓库的 `apps/server/` 中进行，避免两个仓库并行维护的混乱。

---

## 6. 需要注意的兼容性问题

### 6.1 API 兼容性

| 对比项 | Node.js 版 | Rust 版 | 是否兼容 |
|--------|-----------|---------|---------|
| API 路径前缀 | `/api/v1/...` | `/api/v1/...` | ✅ 一致 |
| 设备认证 | Ed25519 签名验证 | Ed25519 签名验证 | ✅ 一致 |
| 通知接口 | `GET /notifications` + `PUT read` | 同上（当前 Rust 版仍保留 read 接口） | ✅ 一致 |
| 数据库表结构 | Prisma init.sql | flyway V1_init.sql | ✅ 一致（SQL 内容相同） |
| 响应格式 | JSON | JSON | ✅ 一致 |

> 客户端无需改动即可对接 Rust 服务端。后续通知重构（删除 read 接口、新增 /sync）在 Rust 版中同步实施。

### 6.2 部署变更

| 对比项 | Node.js 版 | Rust 版 |
|--------|-----------|---------|
| 运行时 | Node.js 24 | 无运行时（静态编译） |
| 部署包大小 | ~50MB (node_modules) | ~10MB (单个二进制) |
| 启动速度 | ~2s | ~50ms |
| 内存占用 | ~200MB | ~20MB |
| 部署方式 | systemd + node / PM2 / Docker | systemd + 二进制 / Docker |
| 环境变量 | `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV` | `DATABASE_URL`, `SERVER_PWD`, `RUST_BACKTRACE` |
| 数据库迁移 | Prisma + 手动 init.sql | flyway 自动迁移（启动时执行） |

### 6.3 客户端连接配置

客户端 `apps/mobile/.env` 中的 `EXPO_PUBLIC_API_URL` 不需要改动，Rust 服务端监听同样的端口（3000）和同样的 API 路径。

---

## 7. 操作清单（Checklist）

| # | 操作 | 命令/说明 | 状态 |
|---|------|-----------|------|
| 1 | 创建 `refactor/server-rust` 分支 | `git checkout -b refactor/server-rust` | ⬜ |
| 2 | 提交当前未提交的变更 | `git add ... && git commit` | ⬜ |
| 3 | 删除 `apps/server/` (Node.js) | `git rm -r apps/server/ && git commit` | ⬜ |
| 4 | 添加 rs-wallet remote | `git remote add rs-wallet ...` | ⬜ |
| 5 | subtree 合入 | `git subtree add --prefix=apps/server rs-wallet/main --squash` | ⬜ |
| 6 | 移动 CI workflows 到根目录 | `mv apps/server/.github/workflows/ → .github/workflows/` | ⬜ |
| 7 | 删除 apps/server 下多余目录 | `rm -rf .cache output target docker-compose.yml` | ⬜ |
| 8 | 合并 .gitignore | 删除 `apps/server/.gitignore`，追加规则到根目录 | ⬜ |
| 9 | 改写 `package.json` | 移除 server workspace，新增 cargo scripts | ⬜ |
| 10 | 改写 `docker-compose.yml` | 指向 Rust server，环境变量改为 Rust 版 | ⬜ |
| 11 | 改写 `scripts/local.ps1` | Start-Server 改为 `cargo run` | ⬜ |
| 12 | 改写 CI workflows | working-directory 改为 `apps/server`，路径引用更新 | ⬜ |
| 13 | 更新 .gitignore | 追加 `apps/server/target/` 等 | ⬜ |
| 14 | 验证 Rust server 编译 | `cd apps/server && cargo build && cargo test` | ⬜ |
| 15 | 验证 mobile 启动 | `cd apps/mobile && npx expo start` | ⬜ |
| 16 | 推送分支并创建 PR | `git push origin refactor/server-rust` | ⬜ |
| 17 | PR 审核并合并到 main | GitHub PR 流程 | ⬜ |
| 18 | 档 rs-wallet 仓库 | GitHub Settings → Archive repository | ⬜ |

---

## 8. 风险与注意事项

| 风险 | 应对策略 |
|------|----------|
| **subtree 合入冲突** | 先删除 apps/server/ 再合入，避免文件冲突 |
| **Rust 编译环境** | 本地开发需安装 Rust toolchain（`rustup`）；CI 由 dtolnay/rust-toolchain 自动安装 |
| **首次 cargo build 慢** | 首次编译约 3-5 分钟，后续增量编译 < 30 秒；CI 有 cache |
| **rs-wallet 后续更新** | 合入后建议归档 rs-wallet 仓库，所有开发在 imwallet 中进行 |
| **deploy 脚本中的 REPO 变量** | `install.sh` 和 `upgrade.sh` 中 `REPO="sixinyiyu/rs-wallet"` 需改为 `REPO="sixinyiyu/imwallet"` |
| **Docker 镜像名** | 从 `ghcr.io/sixinyiyu/rs-wallet` 改为 `ghcr.io/sixinyiyu/imwallet-server` |
| **Release 下载 URL** | 从 rs-wallet 仓库的 releases 改为 imwallet 仓库的 releases |
