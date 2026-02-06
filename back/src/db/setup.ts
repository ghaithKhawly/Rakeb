import { FastifyInstance } from "fastify";

export async function setupDatabase(fastify: FastifyInstance) {
  const client = await fastify.pg.connect();
  
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log("✅ Database tables created/verified");
  } catch (error) {
    console.error("❌ Database setup error:", error);
    throw error;
  } finally {
    client.release();
  }
}