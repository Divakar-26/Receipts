import * as pricing from './pricing.ts'

export function run(name: string, ...args: number[]): number {
  const fn = (pricing as Record<string, (...a: number[]) => number>)[name]
  if (!fn) throw new Error(`unknown op ${name}`)
  return fn(...args)
}
