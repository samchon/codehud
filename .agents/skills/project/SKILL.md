---
name: project
description: Defines the CodeHUD product contract, what the product deliberately does not do, the two adapter axes, workspace layout, and canonical commands. Use when orienting in the repository, working inside any package, choosing a build, test, format, or evidence command, or judging whether a proposed capability is in scope.
---

# Project Outline

## Product Contract

`CodeHUD` lets a developer keep driving the coding agent already running in their own repository after they have walked away from the keyboard. The wearer reads progress, answers approval requests, issues new instructions, and stops turns in flight, using the glasses alone.

Instruction is speech. Reading and review are the eyes. No surface in this product accepts typed characters from the wearer, and the display is never operated.

**The reduction is the product.** An agent produces thousands of tokens per turn; a wearable display carries two lines and holds a wearer's attention for about two seconds. Closing that gap, and letting a wearer answer a blocking approval inside it, is the whole value. Transport, pairing, and vendor SDK plumbing exist to make that reduction reachable.

**Approval is why this product exists.** Everything else a wearer misses can be caught up on later; an approval request stops the agent until a person answers. A change that makes progress prettier while making approval slower, less legible, or less safe is buying the wrong thing.

The committed contract lives in [`docs/requirements/`](../../../docs/requirements/README.md) and [`docs/specifications/`](../../../docs/specifications/README.md). Those documents decide scope; this skill points at them and does not restate them.

## Two Adapter Axes

The product has exactly two axes of substitution, and they must not know about each other.

| Axis | Absorbs | Members |
| --- | --- | --- |
| Harness | How a coding agent reports and is instructed | Claude Code, Codex |
| Device | How a wearable displays and listens | Rokid, the terminal simulator, later vendors |

Exactly one layer knows both, and it belongs to neither: the projection boundary that folds observations into state and composes state against one device's geometry. Adding a member to one axis must cost one adapter on that axis and nothing downstream of it.

## What The Product Does Not Do

- **It does not replace the agent.** No model call, no synthesized tool call, no invented approval option. Judgement belongs to the harness the user chose.
- **It does not require a hosted server.** Both vendors offer a hosted agent that would need no machine of the user's own. Both are out of scope: they bill per token rather than against the subscription the user holds, and only one of them enforces an approval gate on the agent's own sandbox actions. The reasoning is recorded at [`#product-no-hosted-server`](../../../docs/requirements/product/charter.md) and [`#spec-product-local-completeness`](../../../docs/specifications/product-boundary/charter-refinement.md).
- **It does not accept typed input.** Not on the glasses, not on the phone, not anywhere. The terminal simulator is the single stated exception, and it is an exception to the transport of an instruction, never to the routing rules that instruction obeys.
- **It does not resolve an approval by timeout.** There is no elapsed time that becomes an allowance and none that becomes a denial.

A capability that only works with a hosted relay, or that a wearer can only reach by touching or typing, is out of scope even when it would be convenient.

## Workspace Layout

| Path | Holds |
| --- | --- |
| `config/` | Shared `tsconfig.json` and the `@ttsc/lint` rule set every package extends |
| `docs/requirements/` | Product promises a wearer can observe, request, or judge |
| `docs/specifications/` | System contracts that make those promises precise |
| `packages/interface/` | Pure type contracts, no runtime dependency |
| `packages/hud/` | The reducer and composer, pure functions over `interface` types |
| `packages/agent/` | Harness adapters that spawn and normalize Claude Code and Codex |
| `packages/bridge/` | The process that runs on the repository machine |
| `packages/client/` | Device-side session client, shared by the phone shell and the simulator |
| `packages/simulator/` | A terminal device adapter, so the reducer is testable without hardware |
| `test/` | The whole repository's test program |
| `evidence.config.ts` | The cross-language evidence graph |
| `ISSUES.md` | The staging register the GitHub issue list was filed from |

`packages/interface` stays pure types with no runtime dependency. Constraints live in field JSDoc, not in validator tags.

The harness axis lives in `packages/agent` and the device axis in the device adapters. Neither may import the other. `packages/hud` is the projection boundary and imports only `packages/interface`.

## Canonical Commands

| Purpose | Command |
| --- | --- |
| Install | `pnpm install` |
| Build every package | `pnpm run build` |
| Type-check and run the suite | `pnpm run test` |
| Format | `pnpm run format` |
| Check formatting without writing | `pnpm run format:check` |
| Evidence graph | `pnpm run evidence` |
| One package's build | `pnpm --filter @codehud/<name> build` |

Package scope is `@codehud/*`, with the bridge publishing unscoped as `codehud-bridge` so a user reaches it with one `npx` command. The unscoped `glasses` name and the `@glasses` scope are both taken on npm; check the registry before proposing any new published name.

Node is pinned to 22.23.2 through `useNodeVersion`. Dependencies resolve through the `pnpm-workspace.yaml` catalogs rather than per-package version strings.
