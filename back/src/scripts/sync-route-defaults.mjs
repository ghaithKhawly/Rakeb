import "dotenv/config";
import pkg from "pg";

const { Client } = pkg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const result = await client.query(`
    UPDATE routes
    SET
      base_price = COALESCE(base_price, 3000),
      crowding_tendency = COALESCE(crowding_tendency, 'medium')
    WHERE base_price IS NULL OR crowding_tendency IS NULL
    RETURNING id
  `);

  console.log(`updated_routes=${result.rowCount}`);

  await client.end();
}

main().catch((error) => {
  console.error("sync-error:", error.message || error);
  process.exit(1);
});
