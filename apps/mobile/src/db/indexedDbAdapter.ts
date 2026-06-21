import type { DatabaseAdapter, SelectOptions, OrderByClause } from "./types";

/**
 * IndexedDB 适配器（Web 端）。
 * 每个"表"对应一个 object store，keyPath = "id"。
 * 由于客户端数据量小（钱包、账户、联系人），所有过滤/排序在内存中完成。
 */

const DB_NAME = "imwallet";
const DB_VERSION = 4;

/** 客户端所有表名 */
const TABLES = [
  "wallets",
  "accounts",
  "addresses",
] as const;

/** 布尔字段列表（需要 true/false ↔ 1/0 转换） */
const BOOLEAN_FIELDS: Record<string, string[]> = {
  wallets: ["is_pinned"],
};

function isBooleanField(table: string, field: string): boolean {
  return (BOOLEAN_FIELDS[table] ?? []).includes(field);
}

/** 将 JS 值转为存储值（布尔 → 0/1） */
function toStorageValue(table: string, field: string, val: any): any {
  if (isBooleanField(table, field) && typeof val === "boolean") {
    return val ? 1 : 0;
  }
  return val;
}

/** 将存储值转为 JS 值（0/1 → 布尔） */
function fromStorageValue(table: string, field: string, val: any): any {
  if (isBooleanField(table, field) && typeof val === "number") {
    return val === 1;
  }
  return val;
}

/** 转换整行从存储格式到 JS 格式 */
function convertRow<T = Record<string, any>>(table: string, row: Record<string, any>): T {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    result[key] = fromStorageValue(table, key, val);
  }
  return result as T;
}

/** 转换整行从 JS 格式到存储格式 */
function convertToStorage(table: string, data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    result[key] = toStorageValue(table, key, val);
  }
  return result;
}

/** 检查行是否匹配 WHERE 条件 */
function matchesWhere(row: Record<string, any>, where?: Record<string, any>): boolean {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (row[key] !== val) return false;
  }
  return true;
}

/** 按排序条件排序行 */
function sortRows(rows: Record<string, any>[], orderBy?: OrderByClause[]): Record<string, any>[] {
  if (!orderBy || orderBy.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { column, dir } of orderBy) {
      const aVal = a[column];
      const bVal = b[column];
      if (aVal === bVal) continue;
      const cmp = aVal < bVal ? -1 : 1;
      return dir === "DESC" ? -cmp : cmp;
    }
    return 0;
  });
}

export class IndexedDBAdapter implements DatabaseAdapter {
  private db: IDBDatabase | null = null;

  /** 打开/初始化 IndexedDB */
  async init(): Promise<void> {
    if (this.db) return;

    let didUpgrade = false;

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        // v1 → v2：清空所有旧数据（修复占位地址问题 + 移除 devices 表）
        if (oldVersion < 2) {
          didUpgrade = true;
          // 删除所有已存在的 object store（包括已废弃的 devices 表）
          const storesToDelete = Array.from(db.objectStoreNames);
          for (const storeName of storesToDelete) {
            db.deleteObjectStore(storeName);
          }
        }

        // v2 → v3：删除旧 wallets object store（去掉了 identifier 字段），重建新的
        if (oldVersion < 3) {
          didUpgrade = true;
          if (db.objectStoreNames.contains("wallets")) {
            db.deleteObjectStore("wallets");
          }
        }

        // v3 → v4：删除 contacts/contacts_addresses，重建 addresses（新结构）
        if (oldVersion < 4) {
          didUpgrade = true;
          if (db.objectStoreNames.contains("contacts")) {
            db.deleteObjectStore("contacts");
          }
          if (db.objectStoreNames.contains("contacts_addresses")) {
            db.deleteObjectStore("contacts_addresses");
          }
          if (db.objectStoreNames.contains("addresses")) {
            db.deleteObjectStore("addresses");
          }
        }

        // 创建所有 object store
        for (const table of TABLES) {
          if (!db.objectStoreNames.contains(table)) {
            db.createObjectStore(table, { keyPath: "id" });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // 升级后清理 localStorage 中已失效的钱包相关数据
    // 保留设备密钥和配置项，仅清除与旧钱包关联的数据
    if (didUpgrade) {
      this.clearOrphanedWalletStorage();
    }
  }

  /** 清除 localStorage 中已失效的钱包相关数据（升级时调用） */
  private clearOrphanedWalletStorage(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        // 清除助记词、备份标记、活跃钱包记录
        if (
          key.startsWith("aquad_mnemonic_") ||
          key.startsWith("aquad_backed_up_") ||
          key === "aquad_active_wallet"
        ) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch {
      // silent
    }
  }

  /** 确保数据库已初始化 */
  private async ensureInit(): Promise<IDBDatabase> {
    if (!this.db) await this.init();
    return this.db!;
  }

  /** 获取一个事务中的 store */
  private async getStore(table: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.ensureInit();
    const tx = db.transaction(table, mode);
    return tx.objectStore(table);
  }

  /** 将 IDBRequest 包装为 Promise */
  private requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async selectAll<T = Record<string, any>>(table: string, opts?: SelectOptions): Promise<T[]> {
    const store = await this.getStore(table, "readonly");
    const allRows = await this.requestToPromise<Record<string, any>[]>(store.getAll());

    let rows = allRows.filter((row) => matchesWhere(row, opts?.where));
    rows = sortRows(rows, opts?.orderBy);
    if (opts?.limit) rows = rows.slice(0, opts.limit);

    return rows.map((row) => convertRow<T>(table, row));
  }

  async selectOne<T = Record<string, any>>(table: string, opts?: SelectOptions): Promise<T | null> {
    const rows = await this.selectAll<T>(table, { ...opts, limit: 1 });
    return rows[0] ?? null;
  }

  async max(table: string, column: string, where?: Record<string, any>): Promise<number | null> {
    const store = await this.getStore(table, "readonly");
    const allRows = await this.requestToPromise<Record<string, any>[]>(store.getAll());

    const filtered = allRows.filter((row) => matchesWhere(row, where));
    if (filtered.length === 0) return null;

    let maxVal: number | null = null;
    for (const row of filtered) {
      const val = row[column];
      if (typeof val === "number") {
        if (maxVal === null || val > maxVal) maxVal = val;
      }
    }
    return maxVal;
  }

  async insert(table: string, data: Record<string, any>): Promise<void> {
    const store = await this.getStore(table, "readwrite");
    const storageData = convertToStorage(table, data);
    await this.requestToPromise(store.add(storageData));
  }

  async update(table: string, data: Record<string, any>, where: Record<string, any>): Promise<void> {
    const store = await this.getStore(table, "readwrite");
    const allRows = await this.requestToPromise<Record<string, any>[]>(store.getAll());

    const storageData = convertToStorage(table, data);
    for (const row of allRows) {
      if (matchesWhere(row, where)) {
        const merged = { ...row, ...storageData };
        await this.requestToPromise(store.put(merged));
      }
    }
  }

  async remove(table: string, where: Record<string, any>): Promise<void> {
    const store = await this.getStore(table, "readwrite");
    const allRows = await this.requestToPromise<Record<string, any>[]>(store.getAll());

    for (const row of allRows) {
      if (matchesWhere(row, where)) {
        await this.requestToPromise(store.delete(row.id));
      }
    }
  }

  async removeBySubQuery(
    table: string,
    column: string,
    subTable: string,
    subColumn: string,
    subWhere: Record<string, any>
  ): Promise<void> {
    // 1. 查子表获取匹配的 ID 集合
    const subRows = await this.selectAll<Record<string, any>>(subTable, { where: subWhere });
    const subValues = new Set(subRows.map((r) => r[subColumn]));

    // 2. 删除主表中 column 值在子查询结果中的行
    const store = await this.getStore(table, "readwrite");
    const allRows = await this.requestToPromise<Record<string, any>[]>(store.getAll());

    for (const row of allRows) {
      if (subValues.has(row[column])) {
        await this.requestToPromise(store.delete(row.id));
      }
    }
  }

  async selectBySubQuery<T = Record<string, any>>(
    table: string,
    column: string,
    subTable: string,
    subColumn: string,
    subWhere: Record<string, any>,
    orderBy?: OrderByClause[]
  ): Promise<T[]> {
    // 1. 查子表获取匹配的 ID 集合
    const subRows = await this.selectAll<Record<string, any>>(subTable, { where: subWhere });
    const subValues = new Set(subRows.map((r) => r[subColumn]));

    // 2. 查主表中 column 值在子查询结果中的行
    const store = await this.getStore(table, "readonly");
    const allRows = await this.requestToPromise<Record<string, any>[]>(store.getAll());

    let rows = allRows.filter((row) => subValues.has(row[column]));
    rows = sortRows(rows, orderBy);

    return rows.map((row) => convertRow<T>(table, row));
  }
}