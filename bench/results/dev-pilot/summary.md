# Benchmark summary: dev-pilot (all splits)

Models: claude-sonnet-5-5 · Claude Code 2.1.330

| condition | runs | confident-wrong claims | per 100 runs | range across runs | task success | format compliance | mean output tokens | mean wall s | cost |
|---|---|---|---|---|---|---|---|---|---|
| A | 6 | 1 | 16.7 | 16.7 | 83.3% | 0.0% | 796 | 14.7 | $0.56 |
| B | 6 | 1 | 16.7 | 16.7 | 83.3% | 83.3% | 1006 | 15.3 | $0.59 |
| C | 6 | 0 | 0.0 | 0.0 | 100.0% | 83.3% | 1256 | 18.4 | $0.63 |

Receipts (C): 4 blocks in 4/6 runs (0 evidence-backed, 4 untagged-only). 4 block(s) not yet audited: audit-blocks.json. False-block rate: n/a%.

Ship rule: default mode **undetermined (blocks not fully audited)** (audit-blocks.json is incomplete).

Grade audit: 2 of 18 grades sampled; 0 judged; agreement n/a%. LLM-graded items: 0.
