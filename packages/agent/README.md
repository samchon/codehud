# `@codehud/agent`

Harness adapters: how CodeHUD finds, starts, and normalizes the coding agents it drives.

## Why it exists

This is one of the product's two adapter axes. It absorbs the difference between Claude Code and Codex so that nothing downstream of it knows which one is running. Nothing here references a display geometry, an input gesture, or a manufacturer, and nothing on the device axis references a harness.

## Public surface

| Export | Shape | What it does |
| --- | --- | --- |
| `CodeHudHarnessProbe` | class | Reports every harness family, with either an identity or a reason |
| `CodeHudNodeRunner` | class | Reaches the host machine through Node |
| `ICodeHudHarnessRunner` | interface | The seam between the two |
| `CodeHudClaudeAdapter` | class | Launches Claude Code so that it asks, and hands back a conversation |
| `CodeHudClaudeSession` | class | One conversation, and the approvals it is waiting on |
| `CodeHudClaudeNormalizer` | class | Harness output to observations, and what to drop |
| `CodeHudNodeChannel` | class | One running process, reassembled into lines |
| `CodeHudCodexAdapter` | class | Opens a `codex app-server` thread the wearer decides on |
| `CodeHudCodexSession` | class | One thread, its approvals, and JSON-RPC correlation |
| `CodeHudCodexNormalizer` | class | Server notifications to observations, and what to drop |
| `ICodeHudHarnessChannel` | interface | The seam between a session and a process |

`CodeHudHarnessProbe.version` and `CodeHudHarnessProbe.reason` are pure and public: one reads a version out of whatever a harness printed, the other turns whatever was thrown into a line short enough for a display. `CodeHudNodeRunner.directories` and `CodeHudNodeRunner.invocation` are the two platform rules, taking the separator and the platform as parameters so that both operating systems' behaviour is reachable from either.

```typescript
import { CodeHudHarnessProbe, CodeHudNodeRunner } from "@codehud/agent";

const probes = await new CodeHudHarnessProbe(new CodeHudNodeRunner()).probe();
// [{ kind: "claude-code", descriptor: { executable, version, ... } },
//  { kind: "codex", reason: "codex was not found on the PATH" }]
```

## Discovery reports what it could not use

A wearer choosing a harness on a two-line display has to be told that one is missing, rather than handed a shorter list with no explanation. So a probe result carries either a descriptor or a reason, never both and never neither, and the reason names the executable rather than the family because that is what the wearer can act on later at a keyboard.

A harness that runs but reports no version is available without one. An unreadable version is not grounds for hiding a working harness.

Absence and an unreadable path are different answers. A broken path variable, an unreadable directory, and a permission failure are all things a wearer would act on differently from "not installed", and reporting them as absence would send them to install something they already have.

## Two things measured rather than assumed

Both were found against the binaries on a real machine, not taken from documentation.

**Version output disagrees in shape.** `claude --version` prints `2.1.274 (Claude Code)` and `codex --version` prints `codex-cli 0.154.0`, so the rule is to find the first dotted numeric token rather than to match a position.

**A Windows shim cannot be spawned directly.** A global npm install writes `claude`, `claude.cmd`, and `claude.ps1` side by side. The extensionless one is a shell script Windows cannot start at all, and since the fix for CVE-2024-27980 Node refuses to spawn the `.cmd` either, throwing `EINVAL` before the process exists. Resolution therefore prefers the `PATHEXT` candidates, and launching one goes through `cmd.exe /d /s /c` as an ordinary argument vector rather than through a shell.

**A quoted path entry hides what is inside it.** Windows admits them and a great many machines have at least one, because an installer that wrote a path containing a space quoted it. Joining a quoted entry produces a path that cannot exist, so a harness living in one would be reported absent. Entries are unwrapped before anything is looked for inside them.

One behaviour worth knowing rather than fixing: resolution checks for an executable bit, and Windows has none. There `fs.access` with the execute flag is an existence check, so a file with a `PATHEXT` extension is returned whether or not it can run. The launch rewrite is what makes that safe in practice.

## Testing without the binaries

The host machine is reached through `ICodeHudHarnessRunner`, so every branch of discovery is exercised in memory. A test that depended on what happens to be installed would be measuring the machine. For the same reason the Windows rewrite takes the platform as a parameter: a branch only one operating system can reach is a branch the other one's continuous integration silently stops checking.

## Three flags are what make the harness ask

The product exists to put an approval in front of a wearer. Getting that from the Claude Code command line takes three things together, and one is a value `--help` does not list:

```text
--input-format stream-json        so this process can answer at all
--permission-prompt-tool stdio    the sentinel for "the host answers over stdio"
an initialize control request     sent before the first instruction
```

Measured, not assumed. Drop any part and nothing errors, nothing hangs, and every gated tool is refused where no wearer can see it: the agent appears to sabotage its own work. The value came from the shipped binary, which passes exactly `--permission-prompt-tool stdio` when an SDK caller supplies a `canUseTool` callback.

Two constraints follow. Control lines carry **no session identifier**, so a permission request cannot be routed by session and the only thing that says which conversation is being asked about is which process it came from: one process per session, one control channel per session. And a refusal the host gives produces **no** `system/permission_denied` line, because that line reports a local rule deciding; an adapter watching only for it would miss every refusal a wearer actually made.

## An answer reaches the harness only when it is waited on

The harness discards an answer it is not waiting on without complaint. A session that forwarded one hopefully would report success to a wearer whose decision never landed, leaving the agent blocked on a question they believe they answered. So the session remembers each request identifier as the approval passes through, refuses an answer quoting one it does not hold, and refuses the same answer twice.

## What is absorbed

`rate_limit_event`, `system/status`, and `system/thinking_tokens` are real lines that become no observation at all. A wearer would do nothing differently for any of them, and the observation vocabulary is closed so that every member is a situation someone can act on.

`system/permission_denied` is absorbed too: the errored tool result that follows already says the call failed.

## Streaming without saying it twice

With partial messages on, the harness reports the same prose twice, once as deltas and once as the completed message. The fold appends whatever it is handed, so passing both through would show every sentence written out twice. The completed block is therefore emitted as a terminator carrying nothing. With partial messages off there are no deltas and the same terminator carries the whole text, and both routes land on the same state.

## Two harnesses, one observation vocabulary

Claude Code streams NDJSON with a control round-trip bolted alongside; Codex is JSON-RPC in both directions. Downstream of the adapters neither difference exists.

What differs most is where the truth comes from. Claude Code ships no protocol generator, so its adapter is written against captured fixtures. Codex generates its own types, so shape is a compile error — but generation says nothing about **which** messages arrive: `ThreadItem` declares nineteen variants and an ordinary turn emits four, or five when it writes a file. Both adapters are therefore written against captures, for different reasons.

## Answering in the server's own words

Codex has **two decision vocabularies**:

| Method | Response type | Values |
| --- | --- | --- |
| `execCommandApproval` (legacy) | `ReviewDecision` | `approved`, `denied`, `timed_out`, `abort` |
| `item/commandExecution/requestApproval` | `CommandExecutionApprovalDecision` | `accept`, `decline`, `cancel` |

Answering the modern request in the legacy words is **refused silently**: the command does not run, the turn continues, nothing says why. This repository produced a fixture named `approve` that approved nothing for exactly that reason.

So the adapter's options carry the server's own identifiers and the session sends them straight back. There is no translation table, because a translation table is where that mistake lives.

## A file change is named by the item, because the question is not

`item/fileChange/requestApproval` carries `threadId`, `turnId`, `itemId`, `startedAtMs`, an optional reason and an optional grant root. It carries no path and no command, so there is nothing in the question itself to put in front of a wearer.

Until the `fileChange` item was normalized, the fallback answered instead, and the fallback is the phrase reserved for a *permissions* request: a wearer asked whether an agent could write a file was shown **Wider access requested** over the working directory. Two different questions, one box, no way to ask a follow-up.

The item arrives first and carries `changes`, each a path and a kind — `add`, `delete`, `update`, the last optionally moving the file. So the item is remembered under its identifier the way a command execution already is, and the approval finds its subject there. A reason the server did give moves to the line under the title, which a file-change request leaves empty because it names no working directory.

Three neighbours of that rule are not the same rule:

- **A permissions request also carries an `itemId`.** It is asking to widen what the agent may do for the rest of the turn, not to perform the item that prompted it, so it is never titled from that item. Understating an access request is the same mistake pointed the other way, and the other way is worse.
- **A removal is not a write.** A `delete` change kind is the doubly-confirmed class, and nothing could enter it through a patch: both harnesses reach deletion through their execution tool, so the command table is the only thing that files anything under it, and a Codex agent that removed a file through its patch mechanism rather than through `rm` was confirmed once. The change kinds are read, deletion wins over a write in a set containing both, and a move stays a write because the content is at the other path.
- **A grant root is an access request wearing a file change's clothes.** The bindings say that when `grantRoot` is set the agent is asking to write anywhere under that root for the remainder of the session. Approving one file and approving a directory are different answers, so the wearer is told which they are giving and the change goes on the line below.
- **The legacy `applyPatchApproval` carries its own subject.** It has `conversationId`, `callId`, a map from path to `FileChange`, a reason and a grant root — no command, no working directory, no item to look anything up by — so it is described from the paths in the map. Typed from the generated bindings rather than from a capture, because every server this repository has driven sends the modern method.

## The default that is not ours to rely on

`thread/start` takes `approvalsReviewer`, which admits `auto_review` and `guardian_subagent` besides `user`. Those route approvals to a subagent that decides on the wearer's behalf.

`user` is already the default. The adapter states it anyway: a default is the vendor's to change, and the promise that a wearer decides is not.

## Measured: Codex does not time an approval out

A pending approval left unanswered stayed pending for **190 seconds** with nothing resolving it, and the thread reported `waitingOnApproval` throughout. That matters because the contract forbids any approval being settled by elapsed time, and no adapter rule could fix a harness that did it anyway.

Corroborating: the protocol has no approval timeout field at all. Every timeout in the bindings is a *command execution* timeout.

## Contract traceability

Every export cites the requirement and specification it realizes. Run `pnpm run evidence` from the workspace root.
