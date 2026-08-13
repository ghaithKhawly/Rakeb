require("dotenv").config();

const { Client } = require("pg");

// Admin connection to the default 'postgres' database, used only to CREATE the
// app database. Read from the environment — never hardcode the password here,
// this file is committed.
const adminUrl = process.env.PG_ADMIN_URL;

if (!adminUrl) {
  console.error(
    "PG_ADMIN_URL is not set. Copy back/.env.example to back/.env and fill it in,\n" +
      "e.g. PG_ADMIN_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/postgres",
  );
  process.exit(1);
}

async function createDatabase() {
  const client = new Client({ connectionString: adminUrl });

  try {
    await client.connect();
    console.log("Connected to postgres...");

    // Check if 'bus' database exists
    const res = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'bus'",
    );
    if (res.rowCount === 0) {
      console.log('Database "bus" not found. Creating...');
      await client.query("CREATE DATABASE bus");
      console.log('Database "bus" created successfully!');
    } else {
      console.log('Database "bus" already exists.');
    }
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await client.end();
  }
}

createDatabase();
