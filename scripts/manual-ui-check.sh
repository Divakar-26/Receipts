#!/usr/bin/env bash
# Manual check of what the user SEES in the interactive Claude Code UI. Needs a person: Claude Code asks you to trust
# the folder (it runs hooks), and step 3 costs one short model reply.
#
#   bash scripts/manual-ui-check.sh            # sets up a throwaway project and prints the steps
#
# Nothing outside the throwaway folder is changed: the plugin is installed with --scope local.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
dir="$(mktemp -d "${TMPDIR:-/tmp}/receipts-ui-check-XXXXXX")"
prefix="$dir/.prefix"

(cd "$repo" && npm run build --silent && npm pack --silent --pack-destination "$dir" >/dev/null)
npm install -g --silent --prefix "$prefix" "$dir"/receipts-cli-*.tgz

cd "$dir"
git init -q
printf 'console.log("left over")\n' > app.js
git add -A && git -c user.email=u@u -c user.name=u commit -qm init
claude plugin marketplace add "$repo" --scope local >/dev/null
claude plugin install receipts@receipts --scope local >/dev/null
# a probe hook that prints a message as soon as a session starts (no model call needed to see it)
node -e '
const fs = require("fs"); const f = ".claude/settings.local.json"; const s = JSON.parse(fs.readFileSync(f, "utf8"));
s.hooks = { SessionStart: [{ hooks: [{ type: "command", command: "node", args: ["-e", "process.stdout.write(JSON.stringify({systemMessage: \"RECEIPTS-UI-PROBE: hook messages are shown here\"}))"] }] }] };
fs.writeFileSync(f, JSON.stringify(s, null, 2));'

cat <<EOF

Set up in: $dir

1. Start Claude Code there, with the packed receipts-hook on PATH:
     cd "$dir" && PATH="$prefix/bin:\$PATH" claude
2. Trust the folder. You should see "RECEIPTS-UI-PROBE: hook messages are shown here".   (free)
   Check the plugin ran:  cat "$dir/.receipts/hook.log"   (a "session" line)
3. Optional, costs one short reply. Type:
     Reply with exactly: I removed every console.log from app.js. <receipts> absent | no console.log left | pattern: console\\.log </receipts>
   After the reply you should see the Receipts report (❌, app.js:1). In the default "warn" mode it is only shown.
4. Quit with /exit. Delete the folder when done:  rm -r "$dir"

Please report back what you saw in steps 2 and 3.
EOF
