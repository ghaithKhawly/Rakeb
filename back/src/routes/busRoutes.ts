import type { FastifyInstance } from 'fastify'

export async function busRoutes(fastify: FastifyInstance) {
  fastify.get('/test', async () => {
    const result = await fastify.pg.query('SELECT 1 + 1 AS result')
    return result.rows[0]
  })
}