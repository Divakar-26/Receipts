// amounts in basis points
const LEVY_BPS = 700

export function invoiceTotal(amount: number): number {
  return Math.round(amount * (10000 + LEVY_BPS)) / 10000
}
