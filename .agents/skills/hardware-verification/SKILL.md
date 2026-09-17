---
name: hardware-verification
description: Defines how to settle a claim that only a physical pair of glasses can settle, what a measurement must record, and how the result reaches the contract documents. Use when an issue is labelled hardware, when a design decision rests on an unmeasured device behavior, or before writing a device adapter against an unverified assumption.
---

# Hardware Verification

## What only the device can settle

Sort a question before spending a device session on it. Most questions are cheaper to answer another way, and a measurement that a document already answers wastes the one resource that cannot be parallelized.

| Question | Settled by |
| --- | --- |
| Does this method exist, and what is its signature | Reading the installed artifact, under the [vendor research skill](../vendor-research/SKILL.md) |
| Is this capability documented as available | First-party documentation |
| Does our code call it correctly | The test suite against a fake adapter |
| Does the composed content fit the geometry | The simulator at that geometry |
| **How fast does the display actually accept updates** | The device |
| **Does this event actually reach the phone** | The device |
| **What is legible at this text size, outdoors** | The device |
| **Does the connection survive the screen locking** | The device |
| **Does the recognizer hear this word correctly while walking** | The device |

The pattern: documentation answers what is offered, the device answers what it is like. Latency, legibility, throughput, interception, survival, and recognition accuracy are all the second kind.

## A measurement is a recorded number, not an impression

Every hardware verification records:

- the device model and its firmware or system version;
- the SDK artifact version, exactly as resolved, because a reflection workaround that a version needs is a property of that version;
- the procedure, in enough detail that the next session repeats it rather than reinvents it;
- the numbers, with units and with the spread across repetitions, not a single sample;
- the conditions that would change the result.

"It felt fast" is not a measurement. "Patch-to-visible was 120 to 180 ms across twenty updates, sustained; above roughly eight updates per second the display coalesced and dropped intermediate text" is.

## Record before you conclude

Write the raw result into `.wiki/04-vendor-research/` before deciding what it means. A session that reasons first and records second loses the numbers that contradicted the conclusion.

Then, in order:

1. Post the result on the issue that asked for it, with the numbers.
2. If it changes a contract, carry the change into `docs/requirements/` or `docs/specifications/` as its own pull request, citing the measurement.
3. Append the decision to `.wiki/07-decisions/`.

A measurement that changes nothing still gets recorded. Confirming an assumption is a result, and the next session needs to know it was confirmed rather than assumed.

## A failed measurement is a finding

When a capability the design depends on turns out to be absent, that is the highest-value outcome a device session can produce, and it is reported immediately rather than worked around quietly.

The product has one such dependency with no fallback: speech is the only instruction channel, so a device that cannot deliver the wearer's voice to the client cannot be driven at all. That is stated in [`#spec-device-capability-channels`](../../../docs/specifications/device-surface/capability-and-input.md), and a measurement that contradicts it invalidates the product shape rather than one adapter.

Do not soften a negative result into a limitation to be engineered around before it has been reported. Say what was measured, say what it makes impossible, and let the contract change be its own decision.

## Two things a device session must not do

- **Do not leave a workaround unrecorded.** Reflection against an obfuscated vendor artifact, a private field read, a retry that only works after a deliberate first failure: each is a measurement result that pins an SDK version. It goes in the record with the version it was observed against, and it gets a smoke test, because no unit test can detect it breaking.
- **Do not promote a single successful run to a capability.** A thing that worked once on a warm device on a good network is a hypothesis. Repeat it cold, repeat it after a reconnect, and repeat it while the client is backgrounded before writing it down as available.
