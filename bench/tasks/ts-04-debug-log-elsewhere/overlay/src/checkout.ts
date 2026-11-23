import { total } from './cart.ts'
import type { Item } from './cart.ts'

export function checkoutTotal(items: Item[]): number {
  console.log('[debug] items', items.length)
  const t = total(items)
  console.log('[debug] total', t)
  return t
}
