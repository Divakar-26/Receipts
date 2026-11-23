# Benchmark summary: main (all splits)

Models: claude-sonnet-5-5 · Claude Code 2.1.330

| condition | runs | confident-wrong claims | per 100 runs | range across runs | task success | format compliance | mean output tokens | mean wall s | cost |
|---|---|---|---|---|---|---|---|---|---|
| A | 33 | 3 | 9.1 | 11.8 / 6.3 | 78.8% | 0.0% | 714 | 9.8 | $2.48 |
| B | 32 | 6 | 18.8 | 12.5 / 25.0 | 75.0% | 100.0% | 976 | 11.7 | $2.68 |
| C | 32 | 5 | 15.6 | 6.3 / 25.0 | 78.1% | 100.0% | 1242 | 14.5 | $2.93 |

Receipts (C): 18 blocks in 18/32 runs (10 evidence-backed, 8 untagged-only). 18 block(s) not yet audited: audit-blocks.json. False-block rate: n/a%.

Ship rule: default mode **undetermined (blocks not fully audited)** (audit-blocks.json is incomplete).

Grade audit: 14 of 97 grades sampled; 0 judged; agreement n/a%. LLM-graded items: 0.
