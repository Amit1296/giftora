const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT value::text AS v FROM giftora_kv WHERE key='products'");
  const products = JSON.parse(res.rows[0].v);
  let changed = 0;
  for (const p of products) {
    if (p.id === 179 && p.name && p.name.startsWith("Blushing Passion")) {
      p.name = "Blushing Passion";
      changed++;
    }
  }
  if (changed) {
    await client.query("UPDATE giftora_kv SET value=$1::jsonb WHERE key='products'",
      [JSON.stringify(products)]);
    console.log("changed:", changed);
  } else {
    console.log("no change needed");
  }
  await client.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });