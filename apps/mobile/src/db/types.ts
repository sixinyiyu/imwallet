/**
 * 数据库抽象层接口定义。
 * Native 端使用 SQLite（expo-sqlite），Web 端使用 IndexedDB。
 * DAO 服务通过此接口操作数据，不直接写 SQL。
 */

/** 排序条件 */
export interface OrderByClause {
  column: string;
  dir: "ASC" | "DESC";
}

/** 查询选项 */
export interface SelectOptions {
  /** WHERE 条件：字段名 → 值，AND 连接 */
  where?: Record<string, any>;
  /** 排序条件 */
  orderBy?: OrderByClause[];
  /** 返回行数限制 */
  limit?: number;
}

/** 聚合查询结果 */
export interface AggregateResult {
  value: number | null;
}

/**
 * 数据库适配器接口。
 * 所有方法均返回 Promise，表名和字段名使用 snake_case（与 SQLite 一致）。
 */
export interface DatabaseAdapter {
  /**
   * 查询多行。
   * @param table 表名
   * @param opts 查询选项（where, orderBy, limit）
   */
  selectAll<T = Record<string, any>>(table: string, opts?: SelectOptions): Promise<T[]>;

  /**
   * 查询单行（返回第一条匹配，无匹配返回 null）。
   * @param table 表名
   * @param opts 查询选项
   */
  selectOne<T = Record<string, any>>(table: string, opts?: SelectOptions): Promise<T | null>;

  /**
   * 聚合查询：获取某字段的最大值。
   * @param table 表名
   * @param column 要取 MAX 的字段名
   * @param where WHERE 条件
   */
  max(table: string, column: string, where?: Record<string, any>): Promise<number | null>;

  /**
   * 插入一行。
   * @param table 表名
   * @param data 字段名 → 值
   */
  insert(table: string, data: Record<string, any>): Promise<void>;

  /**
   * 更新行。
   * @param table 表名
   * @param data 要更新的字段
   * @param where WHERE 条件（匹配的行都会被更新）
   */
  update(table: string, data: Record<string, any>, where: Record<string, any>): Promise<void>;

  /**
   * 删除行。
   * @param table 表名
   * @param where WHERE 条件（匹配的行都会被删除）
   */
  remove(table: string, where: Record<string, any>): Promise<void>;

  /**
   * 子查询删除：删除 table 中某字段值在另一个表查询结果中的行。
   * 用于 contacts 的级联查询场景。
   * @param table 要删除的表
   * @param column 要匹配的字段
   * @param subTable 子查询的表
   * @param subColumn 子查询的字段
   * @param subWhere 子查询的 WHERE 条件
   */
  removeBySubQuery(
    table: string,
    column: string,
    subTable: string,
    subColumn: string,
    subWhere: Record<string, any>
  ): Promise<void>;

  /**
   * 子查询选择：选择 table 中某字段值在另一个表查询结果中的行。
   * @param table 主表
   * @param column 要匹配的字段
   * @param subTable 子查询的表
   * @param subColumn 子查询的字段
   * @param subWhere 子查询的 WHERE 条件
   * @param orderBy 排序
   */
  selectBySubQuery<T = Record<string, any>>(
    table: string,
    column: string,
    subTable: string,
    subColumn: string,
    subWhere: Record<string, any>,
    orderBy?: OrderByClause[]
  ): Promise<T[]>;
}
