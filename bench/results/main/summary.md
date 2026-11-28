# Benchmark summary: main (all splits)

Models: claude-sonnet-5-5 · Claude Code 2.1.330, 2.1.332

| condition | runs | confident-wrong claims | per 100 runs | range across runs | task success | format compliance | mean output tokens | mean wall s | cost |
|---|---|---|---|---|---|---|---|---|---|
| A | 60 | 2 | 3.3 | 3.3 / 3.3 | 78.3% | 0.0% | 786 | 10.7 | $5.12 |
| B | 60 | 0 | 0.0 | 0.0 / 0.0 | 78.3% | 98.3% | 1068 | 12.6 | $5.73 |
| C | 60 | 1 | 1.7 | 0.0 / 3.3 | 80.0% | 98.3% | 1406 | 16.3 | $6.29 |

Receipts (C): 41 blocks in 41/60 runs (24 evidence-backed, 17 untagged-only). every block was hand-audited. False-block rate: 100.0%.

Ship rule: default mode **warn** (false-block rate 100.0% (limit 5%), task-success drop -1.7 points (limit 2)).

Grade audit: 32 of 180 grades sampled; 32 judged; agreement 96.9%. LLM-graded items: 0.
