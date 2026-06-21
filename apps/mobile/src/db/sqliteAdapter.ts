import * as SQLite from "expo-sqlite";
import type { DatabaseAdapter, SelectOptions, OrderByClause } from "./types";

/**
 * SQLite 适配器（Native 端）。
 * 将 DatabaseAdapter 接口翻译为 SQL 查询，通过 expo-sqlite 执行。
 */

/** 将 WHERE 条件对象转为 SQL 片段 + 参数数组 */
function buildWhere(where?: Record<string, any>): { clause: string; params: any[] } {
  if (!where || Object.keys(where).length === 0) {
    return { clause: "", params: [] };
  }
  const entries = Object.entries(where);
  const clauses = entries.map(([key]) => `${key} = ?`);
  const params = entries.map(([, val]) => val);
  return { clause: `WHERE ${clauses.join(" AND ")}`, params };
}

/** 将 OrderBy 数组转为 SQL 片段 */
function buildOrderBy(orderBy?: OrderByClause[]): string {
  if (!orderBy || orderBy.length === 0) return "";
  const parts = orderBy.map((o) => `${o.column} ${o.dir}`);
  return `ORDER BY ${parts.join(", ")}`;
}

export class SQLiteAdapter implements DatabaseAdapter {
  private db: SQLite.SQLiteDatabase;

  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
  }

  async selectAll<T = Record<string, any>>(table: string, opts?: SelectOptions): Promise<T[]> {
    const { clause: whereClause, params } = buildWhere(opts?.where);
    const orderByClause = buildOrderBy(opts?.orderBy);
    const limitClause = opts?.limit ? `LIMIT ${opts.limit}` : "";
    const sql = `SELECT * FROM ${table} ${whereClause} ${orderByClause} ${limitClause}`.trim().replace(/\s+/g, " ");
    return this.db.getAllAsync<T>(sql, params);
  }

  async selectOne<T = Record<string, any>>(table: string, opts?: SelectOptions): Promise<T | null> {
    const { clause: whereClause, params } = buildWhere(opts?.where);
    const orderByClause = buildOrderBy(opts?.orderBy);
    const sql = `SELECT * FROM ${table} ${whereClause} ${orderByClause} LIMIT 1`.trim().replace(/\s+/g, " ");
    const row = await this.db.getFirstAsync<T>(sql, params);
    return row ?? null;
  }

  async max(table: string, column: string, where?: Record<string, any>): Promise<number | null> {
    const { clause: whereClause, params } = buildWhere(where);
    const sql = `SELECT MAX(${column}) as max_val FROM ${table} ${whereClause}`.trim().replace(/\s+/g, " ");
    const row = await this.db.getFirstAsync<{ max_val: number | null }>(sql, params);
    return row?.max_val ?? null;
  }

  async insert(table: string, data: Record<string, any>): Promise<void> {
    const entries = Object.entries(data);
    const columns = entries.map(([key]) => key).join(", ");
    const placeholders = entries.map(() => "?").join(", ");
    const values = entries.map(([, val]) => val);
    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    await this.db.runAsync(sql, values);
  }

  async update(table: string, data: Record<string, any>, where: Record<string, any>): Promise<void> {
    const dataEntries = Object.entries(data);
    const setClause = dataEntries.map(([key]) => `${key} = ?`).join(", ");
    const setParams = dataEntries.map(([, val]) => val);

    const { clause: whereClause, params: whereParams } = buildWhere(where);

    const sql = `UPDATE ${table} SET ${setClause} ${whereClause}`.trim().replace(/\s+/g, " ");
    await this.db.runAsync(sql, [...setParams, ...whereParams]);
  }

  async remove(table: string, where: Record<string, any>): Promise<void> {
    const { clause: whereClause, params } = buildWhere(where);
    const sql = `DELETE FROM ${table} ${whereClause}`.trim().replace(/\s+/g, " ");
    await this.db.runAsync(sql, params);
  }

  async removeBySubQuery(
    table: string,
    column: string,
    subTable: string,
    subColumn: string,
    subWhere: Record<string, any>
  ): Promise<void> {
    const { clause: subWhereClause, params } = buildWhere(subWhere);
    const sql = `DELETE FROM ${table} WHERE ${column} IN (SELECT DISTINCT ${subColumn} FROM ${subTable} ${subWhereClause})`.trim().replace(/\s+/g, " ");
    await this.db.runAsync(sql, params);
  }

  async selectBySubQuery<T = Record<string, any>>(
    table: string,
    column: string,
    subTable: string,
    subColumn: string,
    subWhere: Record<string, any>,
    orderBy?: OrderByClause[]
  ): Promise<T[]> {
    const { clause: subWhereClause, params } = buildWhere(subWhere);
    const orderByClause = buildOrderBy(orderBy);
    const sql = `SELECT * FROM ${table} WHERE ${column} IN (SELECT DISTINCT ${subColumn} FROM ${subTable} ${subWhereClause}) ${orderByClause}`.trim().replace(/\s+/g, " ");
    return this.db.getAllAsync<T>(sql, params);
  }

  /** 执行原始 SQL（建表等 DDL 语句） */
  async execAsync(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }
}
