---
name: development
description: Defines CodeHUD implementation rules, package boundaries, testing standards, the coverage obligation on changed positions, validation, and change integrity. Use before writing or modifying source, tests, workflows, package wiring, or fixtures.
---

# Development

## Contents

- [Forbidden](#forbidden)
- [Work Rules](#work-rules)
- [Package Boundaries](#package-boundaries)
- [Consequence Analysis](#consequence-analysis)
- [Testing](#testing)
- [Coverage is 100% on what you write](#coverage-is-100-on-what-you-write)
- [Validation](#validation)
- [Change Integrity](#change-integrity)

## Forbidden

These four are never acceptable; choosing any one means the approach is already wrong.

- **No monkey-patching or hardcoding.** Do not special-case a consumer, a fixture name, or an expected value to make output match. Fix the general logic.
- **No test-passing-only logic.** A branch whose only purpose is to satisfy one assertion is a bug in disguise.
- **No forcing a broken design.** When the same failure keeps returning under patch after patch, the design is wrong. Find the root cause and fix the design.
- **No whack-a-mole.** Do not patch the one case that surfaced and move on. Think through every case the same root cause can produce and seal them all with coverage.

## Work Rules

- Match existing conventions. Before adding a file, type, or test, open a nearby peer and mirror its naming, location, and style.
- Keep changes surgical. Touch only what the request and the verified consequence surface require. Edit the lines that change rather than rewriting the file around them; a whole-file rewrite produces the same result while burying the real change in a diff a reviewer then has to reconstruct.
- Ask for everything you already know you need in one step. When the next reads, searches, or checks do not depend on one another's results, issue them together.
- **Never assert a vendor behavior from recall.** Every SDK capability, method signature, protocol field, and platform limit is read from a current source first, under the [vendor research skill](../vendor-research/SKILL.md). A claim that only the device can settle goes to the [hardware verification skill](../hardware-verification/SKILL.md) instead of into code as an assumption.
- Preserve committed traceability when changing a public export. Read the [evidence graph skill](../evidence-graph/SKILL.md), update the requirement and specification citations with the implementation, and validate the affected triangle rather than treating JSDoc as incidental text.
- **A solver lands with the consumer that calls it.** A validated, fully covered function no product path reaches is a public surface with maintenance cost and no effect on anything. Wire the producer to its consumer in the same change, or mark a deliberately early API with `@publicUnconsumed <planned consumer>: <reason>`. The planned consumer names a concrete future component; `none`, `unknown`, and `TBD` are invalid. A test proves behavior but is test reach, never product wiring.
- **A deliberate break lives one at a time, and the tree is safe at every instant.** Disabling a guard to prove a scenario actually fails is the only way to know a green suite is measuring anything, so the technique is required rather than merely allowed. Hold one at a time, never across a step you might not return from. Flip one condition, run the one scenario it pins, restore it by edit, then take the next. Judge the flip by which assertion failed, never by the run failing: the runner type-checks before it starts, so a flip that changes a type rather than a condition exits non-zero having executed nothing. When no flip compiles at all, that is the answer: the invariant is type-enforced, and the honest record says so.
- **A configured check is not a running check until it has been made to fail.** A claim whose selector matches nothing reports the same green as one that matches everything. This repository has already produced the shape twice: root `build` and `test` scripts that matched no project and exited 0, and an evidence claim whose reference population would have passed with every citation deleted. When you add or inherit a lint rule, an evidence claim, or a CI job, delete the thing it is supposed to catch and watch it go red before you believe the green. Count what a population selected rather than trusting that it selected anything. Read a gate by its own exit code, never by a number derived from its output.
- Update the matching `.wiki/` document in the same change when behavior, architecture, or a decision changes. The [documentation skill](../documentation/SKILL.md) owns where.

Formatting and whitespace checks are commit behavior; the [pull-request skill](../pull-request/SKILL.md#commit-logical-units) owns when each runs.

## Package Boundaries

No test enforces these, so they are read in review.

- `packages/interface` is **pure types with no runtime dependency**. It is the shared vocabulary both axes speak; constraints live in field JSDoc, not in validator tags.
- `packages/projection` is the projection boundary. It imports `packages/interface` and nothing else, and its exported functions are pure: no clock, no random source, no input, no output, no mutable global.
- **The two adapter axes never import each other.** The harness axis (`packages/agent`) references no display geometry, input gesture, or manufacturer. The device axis references no harness family, observation kind, or instruction kind. A change that adds a member to one axis and requires editing the other is rejected.
- `packages/bridge` runs on the repository machine and owns process spawning, pairing, and session retention. It may import `agent` and `interface`; it must not import `hud`, because composition belongs to the device that has a geometry.
- `packages/client` runs on the device host and owns transport, folding, and routing. It imports `hud` and `interface`.
- A device adapter renders what it is handed and reports what it observes. Composing, eliding, or rearranging display content and assigning meaning to input are not its authority. This is a specification, not a preference: [`#spec-device-adapter-authority`](../../../docs/specifications/device-surface/capability-and-input.md).

## Consequence Analysis

Treat a reported example as one witness of a cause, not the complete problem statement. Before changing code, trace the same cause through:

- every caller and downstream consumer, including the device adapters and the simulator;
- normal, error, and recovery state transitions;
- reconnection and replay, where the same observation may arrive twice;
- both harness adapters, when the change touches the normalized vocabulary;
- the smallest supported geometry, where most composition defects appear first;
- Windows and POSIX behavior, since the bridge runs on a developer's own machine.

Fix the verified class of failure, not only the reported witness.

## Testing

Tests are `@nestia/e2e` `DynamicExecutor` cases under `test/src/features/<domain>/`. One scenario per file, the exported `test_<snake_case>` matching the file name. Shared builders and predicates live under `test/src/features/internal/`.

Only unit and logic tests belong here. Exercise a function or module through its typed inputs and observable result, including positive, negative, and boundary behavior. Do not launch a harness process, drive a real device, or keep a scenario whose cost does not prove product logic.

**Every test function finishes in under 500 ms.** The runner prints each scenario's elapsed time; a scenario over the budget is rewritten against a smaller unit.

Never hardcode a test to the current repository shape or implementation text. Expected values come from the product contract, a specification, or an independent calculation. When the only way to update a test is to copy the implementation's new output, the test does not qualify.

Assert with `TestValidator.equals(title, actual, expected)` and `TestValidator.predicate(title, <boolean>)`.

Run with `pnpm run test`.

**A case that arranges its own subject must fail when the arrangement fails.** Build the subject through typed in-memory inputs and confirm the intended state before asserting its outcome. A negative twin that never changes the relevant input tests the happy path again.

## Coverage is 100% on what you write

**Every executable position on a line a change writes is exercised by a unit test on statements, branches, functions, and lines.** The obligation is per change and is not negotiable by difficulty. A whole new file is every line of it. Inherited gaps in files a change did not touch are their own work.

The repository carries no coverage instrument and no coverage gate. The obligation is met by the tests a change ships and verified by the reviewer reading the diff beside them. When a unit is too large to see that every branch is reached, split it into functions whose inputs a test can construct in memory.

100% is earned by testing, not by hiding code:

- **A negative twin for every positive.** Wherever a rule fires, pin an adjacent case one property away where it must not fire.
- **Both sides of every branch.** Every `if`, every `??`, every discriminated-union arm, exercised with a real input.
- **Boundaries.** The empty case, the single element, the exact limit, the one-row geometry, the zero-length utterance.
- **Oracle-derived expectations.** Take expected values from the specification or hand calculation, not from whatever the code currently emits.

Do not reach 100% by ignoring a branch. A genuinely unreachable defensive branch is removed by refactoring, not excused.

## Validation

Run the narrowest command that proves the change first, then a broader one when shared behavior or packaging changed. Report any command that could not be run.

- **Bug fix**: name the failing case and expected behavior; add a repro test that fails before and passes after.
- **Feature**: name the observable behavior and exercise it through the suite; for anything that composes display content, exercise it at the smallest supported geometry.
- **Refactor**: name what stays unchanged; rely on the suite or a behavior-locking probe.
- **Contract change**: run `pnpm run evidence` and report the coverage delta.

## Change Integrity

Treat tests, CI workflows, package wiring, dependencies, `evidence.config.ts`, and the `interface` types as part of the specification. Changing them needs an explicit user request or a clear product reason, and the final report must call it out.
