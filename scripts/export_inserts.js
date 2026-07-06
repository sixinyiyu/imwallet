const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "ydyrxBsbxl@00112233",
  database: "aquad_db",
});

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (val instanceof Date) {
    // Convert to ISO format that PostgreSQL accepts
    const iso = val.toISOString().replace("Z", "");
    return "'" + iso + "'";
  }
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function insertStmt(table, cols, vals, conflictKey) {
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT (${conflictKey}) DO NOTHING;`;
}

async function exportTable(tableName, columns, conflictKey) {
  const colList = columns.join(", ");
  const res = await client.query(`SELECT ${colList} FROM ${tableName}`);
  return res.rows.map((row) => {
    const vals = columns.map((c) => esc(row[c]));
    return insertStmt(tableName, columns, vals, conflictKey);
  });
}

async function main() {
  await client.connect();
  console.log("Connected to aquad_db");

  const lines = [];
  lines.push("-- IMWallet 数据迁移：aquad_db → imwallet");
  lines.push("-- 在 imwallet 数据库中执行此文件即可完成迁移");
  lines.push("-- 所有 INSERT 使用 ON CONFLICT DO NOTHING，不覆盖已有数据");
  lines.push("");
  lines.push("BEGIN;");
  lines.push("");

  // 1. devices (老表无 last_active_at，新表有，填 NULL)
  console.log("Exporting devices...");
  const devCols = ["id", "platform", "created_at", "updated_at"];
  const devRes = await client.query(`SELECT ${devCols.join(", ")} FROM devices`);
  lines.push("-- 1. devices (last_active_at 填 NULL)");
  const newDevCols = ["id", "platform", "last_active_at", "created_at", "updated_at"];
  for (const row of devRes.rows) {
    const vals = devCols.map((c) => esc(row[c]));
    vals.splice(2, 0, "NULL");
    lines.push(insertStmt("devices", newDevCols, vals, "id"));
  }
  lines.push("");

  // 2. wallets
  console.log("Exporting wallets...");
  lines.push("-- 2. wallets");
  lines.push(...await exportTable("wallets", ["id", "alias", "source", "created_at", "updated_at"], "id"));
  lines.push("");

  // 3. wallets_addresses
  console.log("Exporting wallets_addresses...");
  lines.push("-- 3. wallets_addresses");
  lines.push(...await exportTable("wallets_addresses", ["id", "chain", "address", "created_at"], "id"));
  lines.push("");

  // 4. assets_addresses
  console.log("Exporting assets_addresses...");
  lines.push("-- 4. assets_addresses");
  lines.push(...await exportTable("assets_addresses", ["id", "address_id", "asset_id", "chain", "balance", "created_at", "updated_at"], "id"));
  lines.push("");

  // 5. wallet_subscriptions
  console.log("Exporting wallet_subscriptions...");
  lines.push("-- 5. wallet_subscriptions");
  lines.push(...await exportTable("wallet_subscriptions", ["wallet_id", "device_id", "chain", "address_id", "created_at"], "wallet_id, device_id, chain, address_id"));
  lines.push("");

  // 6. transactions (新表多了 platform 列，填 '')
  console.log("Exporting transactions...");
  const txCols = ["id", "tx_hash", "from_address", "to_address", "token_symbol", "amount", "fee", "status", "memo", "created_at", "updated_at"];
  const txRes = await client.query(`SELECT ${txCols.join(", ")} FROM transactions`);
  const newTxCols = [...txCols.slice(0, 9), "platform", ...txCols.slice(9)];
  lines.push("-- 6. transactions (platform='')");
  for (const row of txRes.rows) {
    const vals = txCols.map((c) => esc(row[c]));
    vals.splice(9, 0, "''");
    lines.push(insertStmt("transactions", newTxCols, vals, "id"));
  }
  lines.push("");

  // 7. recharges
  console.log("Exporting recharges...");
  lines.push("-- 7. recharges");
  lines.push(...await exportTable("recharges", ["id", "wallet_id", "wallet_alias", "account_address", "token_symbol", "token_name", "amount", "memo", "device_id", "platform", "version", "created_at"], "id"));
  lines.push("");

  // 8. notifications
  console.log("Exporting notifications...");
  lines.push("-- 8. notifications");
  lines.push(...await exportTable("notifications", ["id", "wallet_id", "title", "content", "type", "created_at"], "id"));
  lines.push("");

  // 9. notifications_reads — 老数据库不存在此表
  lines.push("-- 9. notifications_reads (老数据库不存在，跳过)");
  lines.push("");

  lines.push("COMMIT;");
  lines.push("");
  lines.push("-- 验证");
  lines.push("SELECT 'devices'              AS \"表\", COUNT(*) AS \"数量\" FROM devices;");
  lines.push("SELECT 'wallets'              AS \"表\", COUNT(*) AS \"数量\" FROM wallets;");
  lines.push("SELECT 'wallets_addresses'    AS \"表\", COUNT(*) AS \"数量\" FROM wallets_addresses;");
  lines.push("SELECT 'assets_addresses'     AS \"表\", COUNT(*) AS \"数量\" FROM assets_addresses;");
  lines.push("SELECT 'wallet_subscriptions' AS \"表\", COUNT(*) AS \"数量\" FROM wallet_subscriptions;");
  lines.push("SELECT 'transactions'         AS \"表\", COUNT(*) AS \"数量\" FROM transactions;");
  lines.push("SELECT 'recharges'            AS \"表\", COUNT(*) AS \"数量\" FROM recharges;");
  lines.push("SELECT 'notifications'        AS \"表\", COUNT(*) AS \"数量\" FROM notifications;");

  const fs = require("fs");
  fs.writeFileSync("docs/migrate_inserts.sql", lines.join("\n"), "utf8");

  const insertCount = lines.filter(l => l.startsWith("INSERT")).length;
  console.log(`\nDone! Output: docs/migrate_inserts.sql`);
  console.log(`Total INSERT statements: ${insertCount}`);

  await client.end();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
