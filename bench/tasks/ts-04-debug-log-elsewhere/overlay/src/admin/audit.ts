export function audit(event: string): string {
  console.log('[debug] audit event', event)
  return `audit:${event}`
}
