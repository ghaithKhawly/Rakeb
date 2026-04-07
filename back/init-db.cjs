const { Client } = require("pg");

async function createDatabase() {
  // Connect to the default 'postgres' database to create the new one
  const client = new Client({
    connectionString: "postgres://postgres:44241155@localhost:5432/postgres",
  });

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
