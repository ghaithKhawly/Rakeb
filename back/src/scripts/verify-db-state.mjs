import "dotenv/config";
import pkg from "pg";

const { Client } = pkg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();

  const one = async (sql) => (await client.query(sql)).rows[0];

  const routes = await one("SELECT COUNT(*)::int AS count FROM routes");
  const nodes = await one("SELECT COUNT(*)::int AS count FROM nodes");
  const edges = await one("SELECT COUNT(*)::int AS count FROM edges");
  const routeNodes = await one("SELECT COUNT(*)::int AS count FROM route_nodes");

  const defaults = (
    await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE base_price = 3000)::int AS with_3000,
        COUNT(*) FILTER (WHERE crowding_tendency = 'medium')::int AS with_medium
      FROM routes
    `)
  ).rows[0];

  console.log(`routes=${routes.count}`);
  console.log(`nodes=${nodes.count}`);
  console.log(`edges=${edges.count}`);
  console.log(`route_nodes=${routeNodes.count}`);
  console.log(
    `defaults_total=${defaults.total}, with_3000=${defaults.with_3000}, with_medium=${defaults.with_medium}`
  );

  await client.end();
}

main().catch((error) => {
  console.error("verify-error:", error.message || error);
  process.exit(1);
});
