# Benchmark summary: main (all splits)

Models: claude-sonnet-5-5 · Claude Code 2.1.330

| condition | runs | confident-wrong claims | per 100 runs | range across runs | task success | format compliance | mean output tokens | mean wall s | cost |
|---|---|---|---|---|---|---|---|---|---|
| A | 33 | 1 | 3.0 | 5.9 / 0.0 | 78.8% | 0.0% | 714 | 9.8 | $2.48 |
| B | 32 | 0 | 0.0 | 0.0 / 0.0 | 75.0% | 100.0% | 976 | 11.7 | $2.68 |
| C | 32 | 1 | 3.1 | 0.0 / 6.3 | 78.1% | 100.0% | 1242 | 14.5 | $2.93 |

Receipts (C): 18 blocks in 18/32 runs (10 evidence-backed, 8 untagged-only). every block was hand-audited. False-block rate: 100.0%.

Ship rule: default mode **warn** (false-block rate 100.0% (limit 5%), task-success drop 0.7 points (limit 2)).

Grade audit: 14 of 97 grades sampled; 14 judged; agreement 100.0%. LLM-graded items: 0.
