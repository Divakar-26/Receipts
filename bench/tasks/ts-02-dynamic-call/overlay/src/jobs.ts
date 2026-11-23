import { run } from './ops.ts'

export const nightly = (): number => run('apply' + 'Discount', 200, 25)
