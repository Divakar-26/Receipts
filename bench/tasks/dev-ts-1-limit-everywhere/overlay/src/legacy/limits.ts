export const LEGACY_MAX_ITEMS = 10

export function legacyCanAdd(count: number): boolean {
  return count < LEGACY_MAX_ITEMS
}
