# `@samchon/glasses-interface`

Type contracts shared by every part of the product. Pure types with no runtime dependency: nothing here imports anything, and nothing here executes.

## Why it exists

The product has two independent adapter axes. One absorbs the difference between coding agent harnesses, the other absorbs the difference between wearable devices, and neither may know about the other. This package is the vocabulary both of them speak, which is what lets the projection layer between them depend on neither.

Constraints live in field documentation rather than in validator tags. A field's range, its units, and the condition under which it is absent are stated in its JSDoc and enforced at runtime by whichever package owns that behavior.

## Layout

| Directory | Owns |
| --- | --- |
| `agent/` | The harness axis: normalized observations, the instruction set, session lifetime, discovery, and the approval policy |
| `glasses/` | The device axis: declared geometry, negotiated capability, the input vocabulary, and the bound on adapter authority |
| `hud/` | The projection boundary: the frame a device renders and the state the reducer folds |
| `voice/` | Where a finalized utterance goes and what it is allowed to authorize |
| `notification/` | How the wearer's attention is spent, and what happens when they are unreachable |
| `bridge/` | The duplex remote-call surface between a device and the process holding the repository |

## Contract traceability

Every type here cites the requirement and the specification it realizes, in its own JSDoc. The workspace evidence graph checks that every unit of both document layers has a carrier and that every citation resolves. Run it with `pnpm run evidence` from the workspace root.

Start from [the requirements](../../docs/requirements/README.md) and [the specifications](../../docs/specifications/README.md) rather than from this package when asking what the product promises. This package answers what shape those promises take in code.
