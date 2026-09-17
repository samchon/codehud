# CodeHUD System Specifications

This directory refines the product's observable requirements into system contracts that are independent of implementation technology, transport, and package layout.

## What a specification decides {#specifications-role}

A specification fixes inputs and outputs, identity, state transitions, ordering and idempotence, permitted ranges, failure and refusal, and verifiable results.

It does not fix a package, a file, a public symbol, or an internal algorithm as the correct implementation. It does not fix a manufacturer's SDK or a harness's output format either. It fixes only the common contract those must meet.

## System boundaries {#specifications-boundaries}

Each folder owns one system boundary that no other folder can substitute for. The harness boundary owns agent observation and instruction; the voice boundary owns what an utterance becomes; the device boundary owns the display surface and input; the projection boundary owns the reduction that joins them; the notification boundary owns the wearer's attention; the bridge boundary owns local transport and trust; the session boundary owns lifetime and replay.

Data that crosses a boundary requires both specifications to agree on a shared identity and its invariants.

## Specification map {#specifications-topics}

- [Product Boundary](./product-boundary/charter-refinement.md): invariants no other boundary may violate.
- [Agent Harness](./agent-harness/normalized-stream.md): normalized observation, discovery, session lifetime.
- [Agent Harness: control](./agent-harness/control-and-approval.md): instruction vocabulary, approval, policy, outcomes.
- [Voice Surface](./voice-surface/utterance-routing.md): where an utterance goes and what it may authorize.
- [Device Surface](./device-surface/capability-and-input.md): geometry, capability, input, adapter authority.
- [Display Projection](./display-projection/frame-and-state.md): folding and composition.
- [Notification](./notification/attention-contract.md): grades, addressing, suppression, fallback.
- [Local Bridge](./local-bridge/rpc-protocol.md): the remote-call surface, pairing, refusal, liveness.
- [Session Lifecycle](./session-lifecycle/attach-and-replay.md): detachment, replay, handoff.
