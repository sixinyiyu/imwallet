# 通知系统重构方案：改为关联设备 + 本地存储 + 订阅模式

> 版本：v1.1  
> 日期：2026-06-24  
> 作者：QAgent  
> 变更记录：v1.1 明确采用「增量同步 + 时机触发」方案，不引入 WebSocket

---

## 1. 背景与现状分析

### 1.1 当前通知系统架构

| 层面 | 当前实现 |
|------|----------|
| **存储位置** | 服务端 PostgreSQL（`notifications` + `notification_reads` 两张表） |
| **关联维度** | 通知关联 **钱包**（`wallet_id`），阅读状态关联 **设备**（`notification_id + device_id`） |
| **读取方式** | 客户端每次打开通知页，全量从服务端 API 拉取（`GET /notifications`） |
| **已读标记** | 每次标记已读都调用服务端 API（`PUT /notifications/:id/read`） |
| **通知产生** | 服务端转账时创建（`transactionService.ts` 中 `prisma.notification.create`） |
| **客户端服务** | `notificationService` 定义在 `authService.ts` 中，纯 API 调用，无本地持久化 |

### 1.2 当前架构的问题

| 问题 | 说明 |
|------|------|
| **每次打开都要网络请求** | 无本地缓存，离线无法查看通知，体验差 |
| **已读状态管理复杂** | 服务端维护 `notification_reads` 表，每条通知 × 每个设备 = 一行记录，数据膨胀 |
| **关联钱包而非设备** | 同一钱包多设备订阅时，通知共享但阅读状态独立，逻辑复杂且不直观 |
| **与钱包模式不一致** | 钱包是「本地为主 + 服务端同步」，通知却是「纯服务端存储」，架构风格不统一 |
| **无法本地快速查询** | ProfileScreen 每 30 秒轮询未读数，浪费网络请求 |

---

## 2. 目标架构

### 2.1 核心思路：参照钱包的「本地为主 + 服务端同步 + 设备订阅」模式

```
┌─────────────────────────────────────────────────────────────────┐
│                        服务端（通知源）                           │
│  • 转账等业务事件发生时，创建 notification 记录                    │
│  • notification 关联 wallet_id（不变，因为事件属于钱包）           │
│  • 不再维护 notification_reads 表（删除）                        │
│  • 提供 /notifications/sync API，客户端按需增量拉取               │
│  • 不引入 WebSocket / SSE（当前无实时推送需求）                    │
├─────────────────────────────────────────────────────────────────┤
│                        客户端（主存储）                           │
│  • 本地 SQLite/IndexedDB 新增 notifications 表                   │
│  • 已读/未读状态完全在本地管理                                      │
│  • 通知列表、未读计数全部走本地查询，零网络依赖                     │
│  • 在特定时机触发增量同步，从服务端拉取新通知写入本地               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 设计原则

1. **本地优先**：通知的展示、已读标记、未读计数全部走本地数据库，无需网络请求
2. **增量同步 + 时机触发**：客户端在特定时机主动拉取服务端增量通知，不引入 WebSocket
3. **设备关联**：通知通过 `wallet_subscriptions` 关联到设备，只有订阅了该钱包的设备才能拉取到通知
4. **删除 notification_reads 表**：已读状态完全在客户端本地管理，服务端不再维护

### 2.3 为什么不引入 WebSocket？

**决策：当前阶段不引入 WS/SSE，采用「增量同步 + 时机触发」方案。**

#### 通知场景分析

| 通知类型 | 产生时机 | 客户端是否已经知道？ |
|----------|----------|---------------------|
| `TRANSFER_OUT`（转出） | 客户端发起转账后 | ✅ 客户端自己发起的，返回结果时就知道 |
| `TRANSFER_IN`（转入） | 别人向本钱包转账 | ❌ 客户端不知道，需要被动获知 |

只有 `TRANSFER_IN` 是"被动事件"，但当前转账是**系统内转账**（同一服务端处理），转入方下次打开 App 时增量同步即可拿到，不需要毫秒级实时推送。

#### WS vs 增量同步对比

| 维度 | WS 方案 | 增量同步 + 时机触发 |
|------|---------|---------------------|
| **实时性** | 毫秒级 | 秒级（打开 App / 切换页面时同步） |
| **服务端改动** | 新增 WS 服务、连接管理、心跳、重连 | 只加一个 `since` 参数 |
| **客户端改动** | WS 客户端库、前后台切换处理、断线重连 | 一个同步 API 调用 |
| **运维成本** | WS 服务独立部署/扩容 | 无额外基础设施 |
| **移动端适配** | App 后台时 WS 断开，需 Push Notification 补位 | 无此问题 |
| **电量/网络** | 长连接持续耗电耗网 | 按需请求，零额外开销 |

**结论**：WS 的双向通信能力在通知场景下是多余的（通知只需服务端→客户端单向），增量同步方案改动量最小、运维成本最低、已覆盖所有通知场景。

#### 如果未来需要实时推送

优先级排序：

```
1️⃣ 系统级 Push Notification（FCM / APNs）
   → App 在后台也能收到，用户体验最好
   → 移动端钱包 App 的标准做法

2️⃣ SSE（Server-Sent Events）
   → 比 WS 简单，单向推送足够
   → 基于 HTTP，不需要额外基础设施

3️⃣ WebSocket
   → 最复杂，双向通信能力在通知场景下是多余的
```

---

## 3. 增量同步 + 时机触发：详细设计

### 3.1 同步机制

客户端通过 `GET /notifications/sync?since=<ISO时间戳>` 从服务端增量拉取通知。

- **首次同步**：不传 `since`，拉取该设备订阅钱包的所有通知（最多 100 条）
- **增量同步**：传 `since`（上次同步时间），只拉取该时间之后创建的新通知
- **幂等性**：本地按 `id` 去重，重复拉取不会产生重复记录

### 3.2 触发同步的时机

| 时机 | 说明 | 代码位置 |
|------|------|----------|
| **App 启动时** | `loadLocalState` 中调用，确保启动后本地通知是最新的 | `walletStore.ts` |
| **用户打开通知页时** | 进入 NotificationScreen 或下拉刷新时触发 | `NotificationScreen.tsx` |
| **App 从后台切回前台时** | 监听 `AppState` 变化，`active` 时触发同步 | `walletStore.ts` 或 App 根组件 |
| **转账成功后** | 客户端发起转账返回成功后主动同步，确保转出通知立即出现 | `TransferScreen.tsx` 或 `walletStore.ts` |
| **Profile 页面聚焦时** | `useFocusEffect` 中触发同步 + 刷新未读数 | `ProfileScreen.tsx` |

### 3.3 同步流程图

```
触发时机发生
    ↓
notificationSyncService.syncNotifications()
    ↓
获取本地 lastSyncTime → localNotificationService.getLastSyncTime()
    ↓
GET /notifications/sync?since=xxx → 服务端返回增量通知列表
    ↓
localNotificationService.syncNotifications(items) → 写入本地 SQLite
    ↓
UI 刷新 → 通知列表 / 未读计数 从本地数据库重新读取
```

---

## 4. 详细改动方案

### 4.1 服务端改动

#### 4.1.1 数据库变更

**删除 `notification_reads` 表**：

```sql
-- 删除 notification_reads 表（已读状态改为客户端本地管理）
DROP TABLE IF EXISTS "notification_reads" CASCADE;
```

**`notifications` 表保持不变**（通知仍关联 wallet_id，因为事件属于钱包）：

```sql
-- notifications 表结构不变
CREATE TABLE IF NOT EXISTS "notifications" (
    "id"         TEXT        NOT NULL,
    "wallet_id"  VARCHAR(36) NOT NULL,
    "title"      VARCHAR(128) NOT NULL,
    "content"    TEXT        NOT NULL,
    "type"       "NotificationType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
```

> **为什么通知仍关联 wallet_id 而不是 device_id？**  
> 通知的产生源于钱包级别的业务事件（转账入/出），事件本身属于钱包。设备通过 `wallet_subscriptions` 订阅钱包来获取通知，这是间接关联。如果直接关联 device_id，同一钱包多设备订阅时需要为每个设备重复创建通知，浪费存储。

#### 4.1.2 Prisma Schema 变更

删除 `NotificationRead` model：

```prisma
// ❌ 删除以下 model
// model NotificationRead { ... }

// ✅ Notification model 保持不变
model Notification {
  id        String           @id @default(uuid())
  wallet_id String           @map("wallet_id") @db.VarChar(36)
  title     String           @db.VarChar(128)
  content   String           @db.Text
  type      NotificationType @map("type")
  createdAt DateTime         @default(now()) @map("created_at")

  @@map("notifications")
}
```

#### 4.1.3 路由变更

**修改 `apps/server/src/routes/notification.ts`**：

| 原路由 | 新路由 | 说明 |
|--------|--------|------|
| `GET /notifications` | ❌ 删除 | 由 `/sync` 替代 |
| `PUT /notifications/:id/read` | ❌ 删除 | 已读状态改为客户端本地管理 |
| `PUT /notifications/read-all` | ❌ 删除 | 同上 |

新增路由：

| 新路由 | 说明 |
|--------|------|
| `GET /notifications/sync?since=2026-06-24T00:00:00Z` | 增量同步：返回该设备订阅钱包在指定时间之后创建的通知 |

**新增 `/sync` 路由实现**：

```typescript
// apps/server/src/routes/notification.ts

import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import * as notificationService from "../services/notificationService";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

// 增量同步：返回该设备订阅钱包的通知（支持 since 参数）
router.get("/sync", asyncHandler(async (req: Request, res: Response) => {
  const deviceId = req.device!.deviceId;
  const since = req.query.since as string | undefined;

  const notifications = await notificationService.getDeviceNotifications(
    deviceId,
    since ? new Date(since) : undefined
  );
  res.json({ notifications });
}));

export default router;
```

#### 4.1.4 notificationService 改造

```typescript
// apps/server/src/services/notificationService.ts

import prisma from "../config/prisma";
import { logger } from "../utils/logger";

export interface NotificationResult {
  id: string;
  walletId: string;
  title: string;
  content: string;
  type: string;
  createdAt: Date;
}

/** 获取设备的通知列表（基于订阅的钱包），支持增量同步 */
export async function getDeviceNotifications(
  deviceId: string,
  since?: Date
): Promise<NotificationResult[]> {
  // 1. 获取该设备订阅的所有钱包 ID
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: deviceId },
    select: { wallet_id: true },
  });
  const walletIds = [...new Set(subscriptions.map((s: any) => s.wallet_id))];
  if (walletIds.length === 0) return [];

  // 2. 查询通知（支持 since 过滤做增量同步）
  const where: any = { wallet_id: { in: walletIds } };
  if (since) {
    where.createdAt = { gte: since };
  }

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // 3. 不再查阅读状态，直接返回通知列表
  return notifications.map((n: any) => ({
    id: n.id,
    walletId: n.wallet_id,
    title: n.title,
    content: n.content,
    type: n.type,
    createdAt: n.createdAt,
  }));
}

// ❌ 删除 markAsRead()
// ❌ 删除 markAllAsRead()
```

#### 4.1.5 通知创建逻辑不变

`transactionService.ts` 中转账成功后创建通知的逻辑保持不变：

```typescript
// 不变：通知仍关联 wallet_id
await prisma.notification.create({
  data: {
    wallet_id: fromWallet.id,
    title: "转账成功",
    content: `您已向 ${toName} 转出 ${amount} ${input.tokenSymbol}`,
    type: "TRANSFER_OUT",
  },
});

if (toWalletId) {
  await prisma.notification.create({
    data: {
      wallet_id: toWalletId,
      title: "收到转账",
      content: `您收到来自 ${fromName} 的 ${recipientReceived.toFixed(8)} ${input.tokenSymbol}`,
      type: "TRANSFER_IN",
    },
  });
}
```

---

### 4.2 客户端改动

#### 4.2.1 本地数据库新增 notifications 表

在 `apps/mobile/src/db/database.ts` 的 `SQLITE_INIT_SQL` 中新增：

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    synced_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_notifications_wallet_id ON notifications(wallet_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 服务端通知 ID（全局唯一） |
| `wallet_id` | TEXT | 关联钱包 ID |
| `title` | TEXT | 通知标题 |
| `content` | TEXT | 通知内容 |
| `type` | TEXT | 通知类型（TRANSFER_IN / TRANSFER_OUT） |
| `is_read` | INTEGER | 已读状态（0=未读, 1=已读），**本地管理** |
| `created_at` | TEXT | 通知创建时间（ISO 格式） |
| `synced_at` | TEXT | 同步到本地的时间（用于增量同步的 since 参数） |

#### 4.2.2 新增 `localNotificationService.ts`

参照 `localAddressService.ts` / `localWalletService.ts` 的模式：

```typescript
// apps/mobile/src/services/localNotificationService.ts

import { getDatabase, nowISO } from "../db/database";
import type { Notification } from "../types";

function rowToNotification(row: Record<string, any>): Notification {
  return {
    id: row.id,
    walletId: row.wallet_id,
    title: row.title,
    content: row.content,
    type: row.type,
    isRead: row.is_read === 1 || row.is_read === true,
    createdAt: row.created_at,
  };
}

export const localNotificationService = {
  /** 批量插入通知（从服务端同步下来），按 id 去重 */
  async syncNotifications(items: Array<{
    id: string;
    walletId: string;
    title: string;
    content: string;
    type: string;
    createdAt: string;
  }>): Promise<void> {
    const db = await getDatabase();
    const now = nowISO();
    for (const item of items) {
      const existing = await db.selectOne("notifications", { where: { id: item.id } });
      if (existing) continue;

      await db.insert("notifications", {
        id: item.id,
        wallet_id: item.walletId,
        title: item.title,
        content: item.content,
        type: item.type,
        is_read: 0,
        created_at: item.createdAt,
        synced_at: now,
      });
    }
  },

  /** 获取所有通知（按时间倒序） */
  async getAllNotifications(): Promise<Notification[]> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("notifications", {
      orderBy: [{ column: "created_at", dir: "DESC" }],
    });
    return rows.map(rowToNotification);
  },

  /** 获取未读通知数量 */
  async getUnreadCount(): Promise<number> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("notifications", {
      where: { is_read: 0 },
    });
    return rows.length;
  },

  /** 标记单条通知已读 */
  async markAsRead(id: string): Promise<void> {
    const db = await getDatabase();
    await db.update("notifications", { is_read: 1 }, { id });
  },

  /** 标记所有通知已读 */
  async markAllAsRead(): Promise<void> {
    const db = await getDatabase();
    await db.update("notifications", { is_read: 1 }, { is_read: 0 });
  },

  /** 获取最近同步时间（用于增量同步的 since 参数） */
  async getLastSyncTime(): Promise<string | null> {
    const db = await getDatabase();
    const row = await db.selectOne<Record<string, any>>("notifications", {
      orderBy: [{ column: "synced_at", dir: "DESC" }],
    });
    return row?.synced_at || row?.created_at || null;
  },

  /** 删除钱包关联的所有通知（钱包删除时调用） */
  async deleteWalletNotifications(walletId: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("notifications", { wallet_id: walletId });
  },
};
```

#### 4.2.3 新增 `notificationSyncService.ts`

参照 `syncService.ts` 的模式，负责从服务端增量拉取通知并写入本地：

```typescript
// apps/mobile/src/services/notificationSyncService.ts

import api from "./api";
import { localNotificationService } from "./localNotificationService";
import { saveLogToLocal } from "./logService";

export const notificationSyncService = {
  /**
   * 从服务端增量同步通知到本地。
   * 基于 lastSyncTime 只拉取新通知，避免全量拉取。
   * 同步失败不抛异常，返回 0（不阻塞调用方）。
   */
  async syncNotifications(): Promise<number> {
    try {
      // 1. 获取本地最近同步时间
      const lastSyncTime = await localNotificationService.getLastSyncTime();

      // 2. 从服务端拉取增量通知
      const params: Record<string, string> = {};
      if (lastSyncTime) {
        params.since = lastSyncTime;
      }

      const { data } = await api.get("/notifications/sync", { params });
      const serverNotifications = data.notifications || [];

      if (serverNotifications.length === 0) return 0;

      // 3. 写入本地数据库（按 id 去重）
      await localNotificationService.syncNotifications(
        serverNotifications.map((n: any) => ({
          id: n.id,
          walletId: n.walletId,
          title: n.title,
          content: n.content,
          type: n.type,
          createdAt: n.createdAt,
        }))
      );

      saveLogToLocal("info", `[notificationSync] 同步 ${serverNotifications.length} 条通知`);
      return serverNotifications.length;
    } catch (err: any) {
      saveLogToLocal("crash", `[notificationSync] 同步失败: ${err?.message || String(err)}`);
      return 0;
    }
  },
};
```

#### 4.2.4 类型定义更新

修改 `apps/mobile/src/types/index.ts`：

```typescript
// 修改 Notification 类型，增加 walletId
export interface Notification {
  id: string;
  walletId: string;   // 新增：关联钱包 ID
  title: string;
  content: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}
```

#### 4.2.5 `authService.ts` 中的 notificationService 迁移

将 `notificationService` 从 `authService.ts` 中移除，改为独立的本地服务 + 同步服务：

```typescript
// ❌ 删除 authService.ts 中的 notificationService 对象（3个方法全部删除）

// ✅ 新增独立的 notificationSyncService.ts（见 4.2.3）
// ✅ 新增独立的 localNotificationService.ts（见 4.2.2）
```

#### 4.2.6 `NotificationScreen.tsx` 改造

**核心变化**：从「每次打开都请求服务端 API」改为「读取本地数据库 + 下拉刷新时增量同步」

```typescript
// 改造要点：
// 1. fetchNotifications → localNotificationService.getAllNotifications()，纯本地
// 2. onRefresh → notificationSyncService.syncNotifications()，再刷新本地数据
// 3. handleMarkRead → localNotificationService.markAsRead(id)，纯本地
// 4. handleMarkAllRead → localNotificationService.markAllAsRead()，纯本地
// 5. 删除 total/page 分页逻辑（本地数据全量展示，不需要分页）
// 6. 删除对 notificationService（authService）的引用
```

#### 4.2.7 `ProfileScreen.tsx` 未读计数改造

**核心变化**：从「每 30 秒轮询服务端 API」改为「读取本地数据库 + 聚焦时增量同步」

```typescript
// 改造要点：
// 1. fetchUnreadCount → localNotificationService.getUnreadCount()，纯本地
// 2. 删除 setInterval 30秒轮询
// 3. useFocusEffect 中：先同步通知，再刷新未读数
// 4. 删除对 notificationService（authService）的引用
```

#### 4.2.8 `walletStore.ts` 集成通知同步

在钱包启动流程和关键操作中集成通知同步：

```typescript
// walletStore.ts 新增引入
import { notificationSyncService } from "../services/notificationSyncService";
import { localNotificationService } from "../services/localNotificationService";

// loadLocalState 中新增：
loadLocalState: async () => {
  // ... 现有逻辑（设备注册、钱包同步、fetchWallets）...

  // 新增：启动时同步通知到本地
  try {
    await notificationSyncService.syncNotifications();
  } catch {
    // 同步失败不阻塞启动
  }
},

// deleteWallet 中新增：
deleteWallet: async (walletId: string) => {
  // ... 现有逻辑（删除本地 SQLite、SecureStore、服务端）...

  // 新增：删除钱包关联的本地通知
  await localNotificationService.deleteWalletNotifications(walletId);

  await get().fetchWallets();
},
```

#### 4.2.9 App 前后台切换时触发同步

在 App 根组件或 `walletStore` 中监听 `AppState` 变化：

```typescript
// 在 App 根组件（如 WalletScreen 或 App.tsx）中：
import { AppState } from "react-native";
import { notificationSyncService } from "../services/notificationSyncService";

useEffect(() => {
  const subscription = AppState.addEventListener("change", (nextAppState) => {
    if (nextAppState === "active") {
      // App 从后台切回前台，触发增量同步
      notificationSyncService.syncNotifications();
    }
  });
  return () => subscription.remove();
}, []);
```

---

### 4.3 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `apps/server/prisma/schema.prisma` | 修改 | 删除 `NotificationRead` model |
| `apps/server/prisma/init.sql` | 修改 | 删除 `notification_reads` 建表语句 |
| `apps/server/prisma/drop-all.sql` | 修改 | 删除 `notification_reads` 相关内容 |
| `apps/server/src/routes/notification.ts` | **重写** | 删除原路由，新增 `/sync` 路由 |
| `apps/server/src/services/notificationService.ts` | **重写** | 删除阅读状态方法，只保留增量查询 |
| `apps/server/src/services/transactionService.ts` | 不变 | 通知创建逻辑不变 |
| `apps/mobile/src/db/database.ts` | 修改 | 新增 `notifications` 建表 SQL |
| `apps/mobile/src/services/localNotificationService.ts` | **新增** | 本地通知 CRUD 服务 |
| `apps/mobile/src/services/notificationSyncService.ts` | **新增** | 通知增量同步服务 |
| `apps/mobile/src/services/authService.ts` | 修改 | 删除 `notificationService` 对象 |
| `apps/mobile/src/types/index.ts` | 修改 | `Notification` 类型增加 `walletId` |
| `apps/mobile/src/screens/NotificationScreen.tsx` | **重写** | 改为本地数据驱动 |
| `apps/mobile/src/screens/ProfileScreen.tsx` | 修改 | 未读计数改为本地查询 |
| `apps/mobile/src/stores/walletStore.ts` | 修改 | 启动同步 + 删除清理 + 前后台切换 |
| `apps/mobile/src/db/indexedDbAdapter.ts` | 可能修改 | Web 端需支持 notifications 表（如已有自动建表机制则无需改动） |

---

## 5. 数据流对比

### 5.1 改造前

```
[服务端转账] → 创建 Notification(wallet_id)
                    ↓
[客户端打开通知页] → GET /notifications → 服务端查 notifications + notification_reads → 返回列表
[客户端标记已读] → PUT /notifications/:id/read → 服务端 upsert notification_reads
[ProfileScreen] → 每30秒 GET /notifications → 服务端查 → 返回未读数
```

### 5.2 改造后

```
[服务端转账] → 创建 Notification(wallet_id)  ← 不变

[触发时机] → notificationSyncService.syncNotifications()
                    ↓
            GET /notifications/sync?since=xxx → 服务端返回增量通知
                    ↓
            localNotificationService.syncNotifications() → 写入本地 SQLite
                    ↓
[客户端打开通知页] → localNotificationService.getAllNotifications() → 本地查询，零网络
[客户端标记已读] → localNotificationService.markAsRead(id) → 本地更新，零网络
[ProfileScreen] → localNotificationService.getUnreadCount() → 本地查询，零网络
```

---

## 6. 优势总结

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| **离线可用** | ❌ 必须联网 | ✅ 通知列表、已读标记全部离线可用 |
| **响应速度** | 每次打开需网络请求 | 本地 SQLite 查询，毫秒级 |
| **未读计数** | 每 30 秒轮询服务端 | 本地即时查询，无网络开销 |
| **服务端复杂度** | 需维护 notification_reads 表 | 删除该表，服务端只负责创建通知和增量查询 |
| **数据一致性** | 阅读状态跨设备独立但服务端管理 | 阅读状态完全本地，各设备自然独立 |
| **架构一致性** | 与钱包模式不一致 | 与钱包「本地为主 + 服务端同步」模式一致 |
| **实时推送** | 不需要 WS | 不需要 WS，增量同步 + 时机触发已覆盖所有场景 |

---

## 7. 风险与注意事项

| 风险 | 应对策略 |
|------|----------|
| **同步遗漏** | 增量同步 API（`since` 参数）兜底；多个时机触发确保覆盖 |
| **本地数据损坏** | 通知数据可从服务端全量重建（非敏感数据，无丢失风险） |
| **多设备阅读状态不一致** | 预期行为：每个设备独立管理已读状态，与钱包模式一致 |
| **通知量过大** | 服务端 `take: 100` 限制；本地可定期清理超过 90 天的已读通知 |
| **钱包删除后通知残留** | `walletStore.deleteWallet` 中同步清理本地通知 |
| **前后台切换频繁触发同步** | 同步是幂等的（按 id 去重），频繁触发只会产生空响应，无副作用 |

---

## 8. 实施步骤

| 步骤 | 内容 | 依赖 |
|------|------|------|
| **Step 1** | 服务端：删除 `NotificationRead` model + `notification_reads` 表 | 无 |
| **Step 2** | 服务端：重写 `notificationService.ts`（只保留增量查询） | Step 1 |
| **Step 3** | 服务端：重写 `notification.ts` 路由（只保留 `/sync`） | Step 2 |
| **Step 4** | 客户端：`database.ts` 新增 notifications 建表 SQL | 无 |
| **Step 5** | 客户端：新增 `localNotificationService.ts` | Step 4 |
| **Step 6** | 客户端：新增 `notificationSyncService.ts` | Step 5 |
| **Step 7** | 客户端：重写 `NotificationScreen.tsx`（本地数据驱动） | Step 5, 6 |
| **Step 8** | 客户端：改造 `ProfileScreen.tsx`（本地未读计数） | Step 5 |
| **Step 9** | 客户端：改造 `walletStore.ts`（启动同步 + 删除清理） | Step 6 |
| **Step 10** | 客户端：更新 `types/index.ts` + 清理 `authService.ts` | Step 7, 8 |
| **Step 11** | 客户端：App 根组件添加前后台切换监听 | Step 6 |
| **Step 12** | 测试验证：离线场景、增量同步、已读标记、钱包删除、前后台切换 | 全部 |

---

## 9. 后续优化方向（本次不做）

| 方向 | 说明 | 优先级 |
|------|------|--------|
| **系统级 Push Notification** | 集成 FCM/APNs，App 在后台也能收到转入通知 | 🔴 高（有实时需求时首选） |
| **通知分类过滤** | 本地支持按类型（TRANSFER_IN / TRANSFER_OUT）过滤 | 🟡 中 |
| **通知过期清理** | 本地定期清理 90 天以上的已读通知 | 🟡 中 |
| **通知详情跳转** | 点击通知跳转到对应交易详情页 | 🟢 低 |
| **SSE 实时推送** | 如需服务端→客户端单向实时推送，优先考虑 SSE 而非 WS | 🟢 低（当前无需求） |
