import { FastifyInstance } from 'fastify'
import { busRoutes } from './busRoutes'

export async function routes(fastify: FastifyInstance) {
    fastify.register(busRoutes, { prefix: '/bus' })
}