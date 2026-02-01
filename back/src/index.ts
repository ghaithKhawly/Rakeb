import { buildApp } from './app'
import 'dotenv/config'

async function start() {
  const app = await buildApp()

  try {
    await app.listen({
      port: Number(process.env.PORT),
      host: '0.0.0.0'
    })
    console.log('🚍 Bus backend running')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
