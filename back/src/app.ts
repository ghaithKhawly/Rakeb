import Fastify from 'fastify'
import postgresPlugin from './plugins/postgres'
import { routes } from './routes'

export const app = Fastify({
  logger: false
})

export async function buildApp() {
  await app.register(postgresPlugin)
  await app.register(routes)
  return app
}
