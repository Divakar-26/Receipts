import { applyDiscount, formatPrice } from '../src/pricing.ts'

export function summaryLine(price: number, pct: number): string {
  return formatPrice(applyDiscount(price, pct))
}
