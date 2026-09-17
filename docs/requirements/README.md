# CodeHUD Requirements

This directory defines the results a wearable coding-agent product must deliver and the boundaries it must hold. Each topic owns a folder, and each document inside a folder owns one reviewable set of requirement units.

Every requirement unit is realized by `@evidence` citations that name the unit directly, and the workspace `evidence.config.ts` decides which declarations must carry them. A unit that no declaration cites is not recorded as satisfied; it fails as graph debt.

## What a requirement decides {#requirements-role}

A requirement never names a package, a data structure, a transport, or a vendor SDK. It decides what the wearer must be able to see, what they must be able to instruct, and where the product must refuse to guess instead of inferring.

## Identity and traceability {#requirements-trace}

Every H2 and H3 carries an explicit ASCII anchor. That anchor and the meaning attached to it are the requirement identity; specifications and implementation evidence cite the identity rather than the prose, so a document may be rewritten without breaking the graph as long as the identity survives.

## Topic map {#requirements-topics}

- `product/`: what the product is and is not.
  - [charter.md](./product/charter.md): the four wearable operations, the two adapter axes, the no-hosted-server boundary, and why the local harness rather than a hosted one.
- `agent-control/`: driving different coding agent harnesses through one contract.
  - [harness-abstraction.md](./agent-control/harness-abstraction.md): normalized observation, harness discovery, session lifetime.
  - [turn-and-approval.md](./agent-control/turn-and-approval.md): the closed instruction set, blocking approvals, the approval budget, turn outcomes.
- `voice-interaction/`: speech as the sole instruction channel.
  - [spoken-control.md](./voice-interaction/spoken-control.md): no keyboard, commands versus prompts, local queries, never spelling, consent integrity.
- `glasses-device/`: treating devices from different manufacturers as one surface.
  - [device-abstraction.md](./glasses-device/device-abstraction.md): declared geometry, negotiated capability, voice-first input, adapter authority.
- `head-up-display/`: closing the gap between agent output and a wearable display.
  - [glanceable-rendering.md](./head-up-display/glanceable-rendering.md): pre-fitted frames, urgency, device-independent state, reviewable history.
- `notification/`: spending the wearer's attention.
  - [attention-and-quiet.md](./notification/attention-and-quiet.md): three grades, naming the session, quiet mode, fallback delivery.
- `bridge-and-pairing/`: reaching the repository machine without a hosted server.
  - [local-only-transport.md](./bridge-and-pairing/local-only-transport.md): where the bridge runs, the local trust boundary, single rejection channel, surviving backgrounding.
- `session-continuity/`: surviving a wearer who walks away.
  - [reconnect-and-replay.md](./session-continuity/reconnect-and-replay.md): sessions outliving sockets, idempotent replay, handoff between glasses and desk.
