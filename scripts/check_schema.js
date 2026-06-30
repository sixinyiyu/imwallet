const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "ydyrxBsbxl@00112233",
  database: "aquad_db",
});

async function main() {
  await client.connect();

  const tables = [
    "devices", "wallets", "wallets_addresses", "assets_addresses",
    "wallet_subscriptions", "transactions", "recharges", "notifications",
    "notifications_reads"
  ];

  for (const t of tables) {
    const res = await client.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [t]
    );
    if (res.rows.length === 0) {
      console.log(`\n=== ${t}: NOT EXISTS ===`);
    } else {
      console.log(`\n=== ${t} ===`);
      for (const r of res.rows) {
        console.log(`  ${r.column_name}  ${r.data_type}  ${r.is_nullable}`);
      }
      const count = await client.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`  rows: ${count.rows[0].count}`);
    }
  }

  await client.end();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
