#!/usr/bin/env node
// Detached worker started by the ledger hook: takes the git snapshot for one ledger entry and appends it.
//   node snapshot-worker.js <cwd> <snap_id>
import { takeSnapshot } from '../core/snapshot.js';
import { appendSnapshot, ledgerPath } from '../core/ledger.js';

const [cwd, id] = process.argv.slice(2);
if (cwd && id) {
  try {
    appendSnapshot(ledgerPath(cwd), id, await takeSnapshot(cwd));
  } catch {
    /* no snapshot: staleness is reported as "not checked" */
  }
}
