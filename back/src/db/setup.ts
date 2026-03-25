import { FastifyInstance } from "fastify";

export async function setupDatabase(fastify: FastifyInstance) {
  const client = await fastify.pg.connect();
  console.log("Setting up database...");
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
        h3_cell VARCHAR(20),
        geom GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_geom ON nodes USING GIST (geom);
      CREATE INDEX IF NOT EXISTS idx_nodes_h3_cell ON nodes (h3_cell);
    `);

    // Add h3_cell column to existing nodes table if missing
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='nodes' AND column_name='h3_cell'
        ) THEN
          ALTER TABLE nodes ADD COLUMN h3_cell VARCHAR(20);
          CREATE INDEX IF NOT EXISTS idx_nodes_h3_cell ON nodes (h3_cell);
        END IF;
      END $$;
    `);

    // Add routing-metadata columns to nodes (safe migration)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nodes' AND column_name='node_type') THEN
          ALTER TABLE nodes ADD COLUMN node_type VARCHAR(20) DEFAULT 'single';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nodes' AND column_name='route_count') THEN
          ALTER TABLE nodes ADD COLUMN route_count INTEGER DEFAULT 1;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nodes' AND column_name='is_transfer') THEN
          ALTER TABLE nodes ADD COLUMN is_transfer BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nodes_node_type ON nodes (node_type);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'bus',
        avg_speed_kmh DOUBLE PRECISION,
        base_price INTEGER DEFAULT 3000,
        frequency_minutes INTEGER,
        crowding_tendency VARCHAR(10) DEFAULT 'medium',
        geom GEOMETRY(LINESTRING, 4326),          -- full route geometry for display
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Enforce updated defaults for existing installations too.
    await client.query(`
      ALTER TABLE routes
      ALTER COLUMN base_price SET DEFAULT 3000,
      ALTER COLUMN crowding_tendency SET DEFAULT 'medium';
    `);

    // Normalize existing rows so rebuilt/live data is consistent with requested defaults.
    await client.query(`
      UPDATE routes
      SET
        base_price = COALESCE(base_price, 3000),
        crowding_tendency = COALESCE(crowding_tendency, 'medium');
    `);

   
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='routes' AND column_name='geom'
        ) THEN
          ALTER TABLE routes ADD COLUMN geom GEOMETRY(LINESTRING, 4326);
        END IF;
      END $$;
    `);

    // Spatial index on routes.geom
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_routes_geom ON routes USING GIST (geom);
    `);

    // Edges table
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

    // Add routing-metadata columns to edges (safe migration)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edges' AND column_name='edge_type') THEN
          ALTER TABLE edges ADD COLUMN edge_type VARCHAR(10) DEFAULT 'bus';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edges' AND column_name='speed_kmh') THEN
          ALTER TABLE edges ADD COLUMN speed_kmh DOUBLE PRECISION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edges' AND column_name='bearing_deg') THEN
          ALTER TABLE edges ADD COLUMN bearing_deg DOUBLE PRECISION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edges' AND column_name='congestion_factor') THEN
          ALTER TABLE edges ADD COLUMN congestion_factor DOUBLE PRECISION DEFAULT 1.0;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_edges_edge_type ON edges (edge_type);
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
        pathfinding_result JSONB,
        day_of_week SMALLINT NOT NULL,
        hour_of_day SMALLINT NOT NULL,
        traveled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_travel_history_user ON travel_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_travel_history_user_time ON travel_history(user_id, day_of_week, hour_of_day);
      CREATE INDEX IF NOT EXISTS idx_travel_history_origin ON travel_history USING GIST (origin_geom);
      CREATE INDEX IF NOT EXISTS idx_travel_history_dest ON travel_history USING GIST (dest_geom);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='travel_history' AND column_name='pathfinding_result'
        ) THEN
          ALTER TABLE travel_history ADD COLUMN pathfinding_result JSONB;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bus_feedback_reports (
        id SERIAL PRIMARY KEY,
        route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_price NUMERIC(10, 2),
        crowding_level SMALLINT,
        speed_level SMALLINT,
        slowness_level SMALLINT,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CHECK (crowding_level IS NULL OR (crowding_level >= 1 AND crowding_level <= 5)),
        CHECK (speed_level IS NULL OR (speed_level >= 1 AND speed_level <= 5)),
        CHECK (slowness_level IS NULL OR (slowness_level >= 1 AND slowness_level <= 5))
      );
      CREATE INDEX IF NOT EXISTS idx_bus_feedback_route_time ON bus_feedback_reports(route_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bus_feedback_user_time ON bus_feedback_reports(user_id, created_at DESC);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='bus_feedback_reports' AND column_name='speed_level'
        ) THEN
          ALTER TABLE bus_feedback_reports ADD COLUMN speed_level SMALLINT;
        END IF;
      END $$;
    `);

    // Keep only the latest report per (route_id, user_id), then enforce uniqueness.
    await client.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY route_id, user_id
            ORDER BY created_at DESC, id DESC
          ) AS rn
        FROM bus_feedback_reports
      )
      DELETE FROM bus_feedback_reports b
      USING ranked r
      WHERE b.id = r.id
        AND r.rn > 1;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_bus_feedback_route_user
      ON bus_feedback_reports(route_id, user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS route_live_metrics (
        route_id INTEGER PRIMARY KEY REFERENCES routes(id) ON DELETE CASCADE,
        reports_count INTEGER NOT NULL DEFAULT 0,
        confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        avg_reported_price DOUBLE PRECISION,
        avg_crowding_level DOUBLE PRECISION,
        avg_speed_level DOUBLE PRECISION,
        avg_slowness_level DOUBLE PRECISION,
        effective_price DOUBLE PRECISION,
        effective_speed_score DOUBLE PRECISION,
        effective_crowding_score DOUBLE PRECISION,
        effective_slowness_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        suggested_avg_speed_kmh DOUBLE PRECISION,
        last_report_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_route_live_metrics_updated_at ON route_live_metrics(updated_at DESC);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='route_live_metrics' AND column_name='avg_speed_level'
        ) THEN
          ALTER TABLE route_live_metrics ADD COLUMN avg_speed_level DOUBLE PRECISION;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='route_live_metrics' AND column_name='effective_speed_score'
        ) THEN
          ALTER TABLE route_live_metrics ADD COLUMN effective_speed_score DOUBLE PRECISION;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_routing_preferences (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        speed_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
        crowding_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
        price_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
        transfer_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
        walking_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
        max_walking_distance_m DOUBLE PRECISION NOT NULL DEFAULT 1000,
        max_walking_neighbors INTEGER NOT NULL DEFAULT 12,
        walking_speed_mps DOUBLE PRECISION NOT NULL DEFAULT 1.25,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CHECK (speed_weight >= 0),
        CHECK (crowding_weight >= 0),
        CHECK (price_weight >= 0),
        CHECK (transfer_weight >= 0),
        CHECK (walking_weight >= 0),
        CHECK (max_walking_distance_m >= 50 AND max_walking_distance_m <= 2000),
        CHECK (max_walking_neighbors >= 1 AND max_walking_neighbors <= 100),
        CHECK (walking_speed_mps >= 0.4 AND walking_speed_mps <= 3.5)
      );
    `);

    console.log("✅ Database tables created/verified");
  } catch (error) {
    console.error("❌ Database setup error:", error);
    throw error;
  } finally {
    client.release();
  }
}