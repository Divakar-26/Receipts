export const LEGACY_TAX = 0.07

export function legacyWithTax(amount: number): number {
  return Math.round(amount * (1 + LEGACY_TAX) * 100) / 100
}
