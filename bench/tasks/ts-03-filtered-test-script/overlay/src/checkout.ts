import { total } from './cart.ts'
import type { Item } from './cart.ts'

export function checkoutTotal(items: Item[]): number {
  return total(items)
}
