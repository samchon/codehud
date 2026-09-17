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

```typescript
import { CodeHudHarnessProbe, CodeHudNodeRunner } from "@codehud/agent";

const probes = await new CodeHudHarnessProbe(new CodeHudNodeRunner()).probe();
// [{ kind: "claude-code", descriptor: { executable, version, ... } },
//  { kind: "codex", reason: "codex was not found on the PATH" }]
```

## Discovery reports what it could not use

A wearer choosing a harness on a two-line display has to be told that one is missing, rather than handed a shorter list with no explanation. So a probe result carries either a descriptor or a reason, never both and never neither, and the reason names the executable rather than the family because that is what the wearer can act on later at a keyboard.

A harness that runs but reports no version is available without one. An unreadable version is not grounds for hiding a working harness.

## Two things measured rather than assumed

Both were found against the binaries on a real machine, not taken from documentation.

**Version output disagrees in shape.** `claude --version` prints `2.1.274 (Claude Code)` and `codex --version` prints `codex-cli 0.154.0`, so the rule is to find the first dotted numeric token rather than to match a position.

**A Windows shim cannot be spawned directly.** A global npm install writes `claude`, `claude.cmd`, and `claude.ps1` side by side. The extensionless one is a shell script Windows cannot start at all, and since the fix for CVE-2024-27980 Node refuses to spawn the `.cmd` either, throwing `EINVAL` before the process exists. Resolution therefore prefers the `PATHEXT` candidates, and launching one goes through `cmd.exe /d /s /c` as an ordinary argument vector rather than through a shell.

## Testing without the binaries

The host machine is reached through `ICodeHudHarnessRunner`, so every branch of discovery is exercised in memory. A test that depended on what happens to be installed would be measuring the machine. For the same reason the Windows rewrite takes the platform as a parameter: a branch only one operating system can reach is a branch the other one's continuous integration silently stops checking.

## Contract traceability

Every export cites the requirement and specification it realizes. Run `pnpm run evidence` from the workspace root.
