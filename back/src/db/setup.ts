import { FastifyInstance } from "fastify";

export async function setupDatabase(fastify: FastifyInstance) {
  const client = await fastify.pg.connect();
  console.log("hi");
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS nodes (
        id SERIAL PRIMARY KEY,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        geom GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Spatial index for fast nearest-neighbor and radius queries
      CREATE INDEX IF NOT EXISTS idx_nodes_geom ON nodes USING GIST (geom);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'bus',
        avg_speed_kmh DOUBLE PRECISION,
        base_price INTEGER,
        frequency_minutes INTEGER,
        crowding_tendency VARCHAR(10) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

     await client.query(`
      CREATE TABLE IF NOT EXISTS edges (
        id SERIAL PRIMARY KEY,
        from_node INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        to_node INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
        travel_time DOUBLE PRECISION NOT NULL,
        distance_km DOUBLE PRECISION NOT NULL,
        geom GEOMETRY(LINESTRING, 4326),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (from_node, to_node, route_id)
      );

      CREATE INDEX IF NOT EXISTS idx_edges_from_node ON edges(from_node);
      CREATE INDEX IF NOT EXISTS idx_edges_route_id ON edges(route_id);
      CREATE INDEX IF NOT EXISTS idx_edges_geom ON edges USING GIST (geom);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS route_nodes (
        route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
        node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
        sequence_order INTEGER NOT NULL,
        PRIMARY KEY (route_id, sequence_order)
      );

      CREATE INDEX IF NOT EXISTS idx_route_nodes_node_id ON route_nodes(node_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS travel_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        origin_lat DOUBLE PRECISION NOT NULL,
        origin_lng DOUBLE PRECISION NOT NULL,
        origin_geom GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (
          ST_SetSRID(ST_MakePoint(origin_lng, origin_lat), 4326)
        ) STORED,
        dest_lat DOUBLE PRECISION NOT NULL,
        dest_lng DOUBLE PRECISION NOT NULL,
        dest_geom GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (
          ST_SetSRID(ST_MakePoint(dest_lng, dest_lat), 4326)
        ) STORED,
        origin_label VARCHAR(100),
        dest_label VARCHAR(100),
        route_ids INTEGER[],
        transfer_count INTEGER DEFAULT 0,
        total_distance_m DOUBLE PRECISION,
        total_duration_seconds DOUBLE PRECISION,
        day_of_week SMALLINT NOT NULL,
        hour_of_day SMALLINT NOT NULL,
        traveled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_travel_history_user ON travel_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_travel_history_user_time ON travel_history(user_id, day_of_week, hour_of_day);
      CREATE INDEX IF NOT EXISTS idx_travel_history_origin ON travel_history USING GIST (origin_geom);
      CREATE INDEX IF NOT EXISTS idx_travel_history_dest ON travel_history USING GIST (dest_geom);
    `);

    console.log("✅ Database tables created/verified");
  } catch (error) {
    console.error("❌ Database setup error:", error);
    throw error;
  } finally {
    client.release();
  }
}