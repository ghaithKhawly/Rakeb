import fp from 'fastify-plugin'
import postgres from '@fastify/postgres'
import 'dotenv/config'

export default fp(async (fastify) => {
  fastify.register(postgres, {
    connectionString: process.env.DATABASE_URL,
    max: 10
  })
})
