import fs from 'node:fs'
import * as pricing from './pricing.ts'

function routes(): Record<string, string> {
  const local = 'config/routes.local.json'
  const file = process.env.SHOP_ENV === 'dev' && fs.existsSync(local) ? local : 'config/routes.json'
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function handle(path: string, ...args: number[]): number | string {
  const fn = (pricing as Record<string, (...a: number[]) => number | string>)[routes()[path]]
  return fn(...args)
}
