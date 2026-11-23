import semver from 'semver'

export function isNewer(a: string, b: string): boolean {
  return semver.gt(a, b)
}
