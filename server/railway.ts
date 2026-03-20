import fs from 'fs'
import path from 'path'

let RAILWAY_TOKEN: string

function initRailway() {
  // Try env var first
  if (process.env.RAILWAY_TOKEN) {
    RAILWAY_TOKEN = process.env.RAILWAY_TOKEN
    return
  }
  // Fall back to local config
  try {
    const configPath = path.join(process.env.HOME || '', '.railway', 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    RAILWAY_TOKEN = config.user?.token
    if (!RAILWAY_TOKEN) throw new Error('No token found')
    console.log('[railway] Initialized with local credentials')
  } catch (e) {
    console.warn('[railway] Failed to initialize:', (e as Error).message)
    RAILWAY_TOKEN = ''
  }
}

export { initRailway, RAILWAY_TOKEN }
