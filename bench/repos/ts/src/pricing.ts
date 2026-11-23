export const TAX_RATE = 0.07

export function applyDiscount(amount: number, pct: number): number {
  return Math.round(amount * (100 - pct)) / 100
}

export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export function withTax(amount: number): number {
  return Math.round(amount * (1 + TAX_RATE) * 100) / 100
}
