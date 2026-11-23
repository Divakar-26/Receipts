import * as pricing from './pricing.ts'
import routes from '../config/routes.json' with { type: 'json' }

export function handle(path: string, ...args: number[]): number | string {
  const fn = (pricing as Record<string, (...a: number[]) => number | string>)[(routes as Record<string, string>)[path]]
  return fn(...args)
}
