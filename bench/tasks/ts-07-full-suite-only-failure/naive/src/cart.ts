import { applyDiscount, withTax } from './pricing.ts'

export type Item = { price: number; qty: number; discount?: number }

export function subtotal(items: Item[]): number {
  return items.reduce((sum, i) => sum + applyDiscount(i.price * i.qty, i.discount ?? 0), 0)
}

export function total(items: Item[]): number {
  return withTax(subtotal(items))
}

export function clearCart(items: Item[]): Item[] {
  void items
  return []
}
