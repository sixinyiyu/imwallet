# PRD: IMWallet 1.0.2 版本迭代 — AquaD 重构

## 项目概述

IMWallet 1.0.2 版本是一次重大架构变更，核心变化是**去掉用户概念，改为纯钱包概念**。APP名称从"imwallet"改为"AquaD"，整体UI风格从蓝色系改为绿色系，交互流程从"登录→钱包"变为"创建/导入钱包→账户管理"。

---

## 功能需求

### FR-1: APP名称调整
- APP名称从 `imwallet` 改为 `AquaD`
- 涉及文件：`app.json`（name、slug）、Android package name 可保持不变
- 所有用户可见的文本中"imwallet"替换为"AquaD"

### FR-2: APP Icon 调整
- 替换 `apps/mobile/assets/icon.png` 为 `asset/icon.png`
- 替换相关 Android adaptive icon 资源

### FR-3: 登录界面调整（核心变更）
- **去掉登录/注册功能**，不再有"用户"概念
- APP启动后进入新的 StartScreen，显示：
  - 背景图（`asset/app_bg.png`）
  - APP Logo/名称 "AquaD"
  - **创建钱包按钮**：深绿色背景 `#287220`，白色文字 `#FFFFFF`
  - **导入钱包按钮**：浅黄绿底色 `#E8F9B0`，深绿色文字 `#287220`
- 参考示例图：`asset/app_demo.png`
- 删除 `LoginScreen.tsx` 和 `RegisterScreen.tsx`

### FR-4: 钱包注册逻辑（核心变更）
- 钱包需要**助记词**（mnemonic）
  - 创建钱包时自动生成12/24词助记词
  - 导入钱包时用户输入助记词
- 钱包有**标识**（identifier）
  - 生成规则：`aqud` + 32位随机字符串（Base62编码：0-9, a-z, A-Z）
  - 示例：`aqud14x58canDWembKKvD5rs6xzJEvzzPvFKxP2P9`
  - 标识全局唯一，用于API认证
- 钱包有**来源字段**（source）
  - `CREATE`：通过助记词创建
  - `IMPORT`：导入已有助记词
- 钱包有**备份状态**（isBackedUp）
  - 默认 `false`
  - 只有备份了的钱包才可以进行交易操作（转账）
  - 备份操作：用户确认已安全保存助记词后标记为已备份

### FR-5: 钱包下管理账户
- **账户 = 区块链网络**
- 一个钱包下可以有多个账户
- 每个账户对应一种代币类型（如 TRX、USDT）
- 账户信息包括：账户名、icon、代币类型、地址、网络

### FR-6: 钱包管理菜单调整
- "我的"菜单中的"钱包管理"需要调整：
  - 钱包管理下方显示**账户个数**，如"2个账户"
  - 进入钱包管理后显示：
    - 钱包名称
    - 账户个数
    - 可添加账户
    - 可添加钱包（按钮在底部中间）
  - 点击"添加钱包"弹出**抽屉式弹窗**
    - 样式参考 `asset/account_demo.png`
    - **没有"链接其他钱包"选项**（只有创建钱包和导入钱包）

### FR-7: 创建钱包流程
- 创建钱包界面参考 `asset/create_account.png`
- **去掉"探索多账户钱包的可能性"文字**
- 创建成功后，**马上进入"添加账户"导航页面**
  - 参考图 `asset/add_zhanghu.png`
  - 账户是通过选择某类代币后生成的
- **Tron代币账户生成规则**：
  - 地址格式：`T` + 33位随机字符串（0-9, a-z, A-Z）
  - 示例：`TAbc123XYZ987def456GHI789jkl012MNO345`
  - 账户包含：账户名、icon、代币类型、地址

### FR-8: 钱包菜单功能按钮调整
- 功能按钮/图标底色：深色半透明 `#222038` RGB(34,32,56)，10%透明度
- 图标线条颜色：浅白 `#E2E0F0`
- 三个功能按钮：转账、收款、交易
- 使用新的SVG图标（文档中提供的三个SVG）

---

## 数据模型变更

### 新增模型：Account
```
Account {
  id: UUID
  walletId: UUID (FK → Wallet)
  name: String (账户名)
  tokenType: String (代币类型，如 TRX/USDT)
  address: String (链上地址，Tron格式: T+33chars)
  network: String (网络名，如 "Tron")
  iconUrl: String? (图标URL)
  balance: Decimal (余额)
  createdAt: DateTime
  updatedAt: DateTime
}
```

### 修改模型：Wallet
```
Wallet {
  id: UUID
  identifier: String (aqud+32位Base62, unique) ← 新增
  alias: String (钱包别名)
  source: WalletSource (CREATE/IMPORT)
  isBackedUp: Boolean (默认false) ← 新增
  memo: String
  createdAt: DateTime
  updatedAt: DateTime
  // 移除 address 字段（地址现在在Account中）
  // 移除与User的直接关联（改为identifier认证）
}
```

### 认证机制变更
- 移除基于 User + JWT 的认证
- 改为基于 Wallet identifier 的认证
- APP本地存储：identifier + 助记词（加密存储在SecureStore）
- API请求携带 identifier 作为身份标识
- 保留 User 模型供管理员后台使用，但普通用户不再感知

---

## 非功能需求

### NFR-1: 安全性
- 助记词必须加密存储在本地（SecureStore / Keychain / Keystore）
- 助记词不通过网络传输（只在创建/导入时本地使用）
- identifier 用于API认证，不暴露助记词

### NFR-2: 数据迁移
- 需要数据库迁移脚本（Prisma migrate）
- 旧数据兼容：现有钱包需要补充 identifier 和 isBackedUp 字段

### NFR-3: UI一致性
- 绿色主题色：`#287220`
- 深色半透明：`#222038` (10% opacity)
- 浅白线条：`#E2E0F0`
- 浅黄绿：`#E8F9B0`

### NFR-4: 构建发布
- 不自动推送tag触发构建
- 所有改动需用户确认后才能commit和push

---

## 用户故事

### US-1: 新用户首次使用
**作为**新用户，**我希望**打开APP后看到创建/导入钱包的选项，**以便**快速开始使用钱包而不需要注册账号。
- 验收：APP启动显示StartScreen，有创建钱包和导入钱包两个按钮

### US-2: 创建钱包
**作为**用户，**我希望**点击创建钱包后生成助记词并创建钱包标识，**以便**拥有一个唯一标识的钱包。
- 验收：创建后显示助记词（需用户确认备份），生成aqud+32位标识

### US-3: 添加账户
**作为**用户，**我希望**创建钱包后立即进入添加账户页面，选择代币类型生成账户，**以便**开始使用特定代币。
- 验收：创建钱包后导航到添加账户页，选择TRX/USDT后生成对应地址

### US-4: 备份钱包
**作为**用户，**我希望**在备份助记词后才能进行转账操作，**以便**确保我不会因丢失助记词而丢失资产。
- 验收：未备份钱包时转账按钮禁用或提示，备份后可正常转账

### US-5: 管理钱包和账户
**作为**用户，**我希望**在钱包管理中看到每个钱包的账户数量，并能添加新账户或新钱包，**以便**灵活管理多个资产。
- 验收：钱包管理显示账户数，有添加账户和添加钱包按钮

### US-6: 导入钱包
**作为**用户，**我希望**通过输入助记词导入已有钱包，**以便**在多设备间同步。
- 验收：导入流程接受助记词输入，生成对应钱包标识和账户

---

## 技术约束

1. 保持与现有服务器部署方式的兼容（Systemd/PM2/Docker）
2. 数据库迁移必须可逆
3. APP构建仍通过EAS + GitHub Actions
4. 不修改CI/CD workflow文件结构
