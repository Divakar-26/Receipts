export const MAX_ITEMS = 10

export function canAdd(count: number): boolean {
  return count < MAX_ITEMS
}
