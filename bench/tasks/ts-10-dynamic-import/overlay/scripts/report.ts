const mod = 'leg' + 'acy'
const m = await import(`../src/${mod}.ts`)
console.log(m.legacyRound(2.6))
