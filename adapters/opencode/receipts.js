// receipts:managed
// Receipts plugin for OpenCode (V2 plugin API, @opencode/plugin 2.3.x).
// Built from the published type definitions; NOT yet verified in a live OpenCode session.
//
// - tool.execute.after (bash)  -> ledger entry
// - session prompt             -> new turn: reset the retry counter
// - experimental.idle          -> check the final message; if it fails, admit a synthetic
//                                 message so the session continues instead of going idle
// No import of "@opencode/plugin": its `Plugin.define(p)` is `return p` (checked in @opencode/plugin 2.3.2,
// dist/promise/plugin.js), so exporting the plugin object directly avoids a module that may not resolve from
// .opencode/plugins/ in a project without node_modules.
import { execFile } from "node:child_process"

const HOOK = "__RECEIPTS_HOOK__" // replaced by `receipts init`; otherwise `receipts-hook` on PATH is used

function call(kind, payload) {
  const [bin, pre] = HOOK.startsWith("__") ? ["receipts-hook", []] : [process.execPath, [HOOK]]
  return new Promise((resolve) => {
    const child = execFile(bin, [...pre, "opencode", kind], { timeout: 15000, encoding: "utf8" }, (err, stdout) => {
      try {
        resolve(stdout ? JSON.parse(stdout) : null)
      } catch {
        resolve(null)
      }
    })
    child.on("error", () => resolve(null))
    child.stdin?.on("error", () => {})
    child.stdin?.end(JSON.stringify(payload))
  })
}

const textOf = (content) =>
  (Array.isArray(content) ? content : [])
    .map((c) => (c && typeof c.text === "string" ? c.text : ""))
    .filter(Boolean)
    .join("\n")

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null)

export default {
  id: "receipts",
  async setup(ctx) {
    const cwd = ctx.location.directory

    await ctx.tool.hook("execute.after", async (e) => {
      try {
        if (!/^bash$/i.test(e.tool)) return
        const command = e.input && e.input.command
        if (typeof command !== "string") return
        const meta = (e.status === "completed" ? e.result && e.result.metadata : e.error && e.error.metadata) || {}
        const output = e.status === "completed" ? textOf(e.result && e.result.content) : (e.error && e.error.message) || ""
        // OpenCode documents no exit-code field for bash; use one only if the metadata carries it.
        const exit = [meta.exit, meta.exitCode, meta.exit_code].map(num).find((x) => x !== null)
        await call("ledger", { session_id: e.sessionID, cwd, tool: e.tool, command, output, exit: exit === undefined ? null : exit })
      } catch {
        /* never break the agent */
      }
    })

    await ctx.session.hook("prompt", async (e) => {
      await call("prompt", { session_id: e.sessionID, cwd })
    })

    await ctx.session.hook("experimental.idle", async (e) => {
      try {
        const messages = await ctx.session.context({ sessionID: e.sessionID })
        const last = [...messages].reverse().find((m) => m.type === "assistant")
        const text = last ? textOf((last.content || []).filter((c) => c.type === "text")) : ""
        if (!text) return
        const out = await call("stop", { session_id: e.sessionID, cwd, last_assistant_message: text })
        if (out && out.decision === "block" && out.reason) {
          await ctx.session.synthetic({ sessionID: e.sessionID, text: out.reason, description: "Receipts: claim check" })
        }
      } catch {
        /* never break the agent */
      }
    })
  },
}
