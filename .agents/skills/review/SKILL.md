---
name: review
description: Defines exhaustive review, Self-Review, and solo repository-wide issue-discovery rounds for glasses. Use for every self-review or unqualified review request and as the review mode inside an issue campaign. One reviewer always covers one whole declared surface; this skill never splits a surface across agents.
---

# Review

## Non-Negotiable Review Law

One reviewer performs every review in this skill from scratch over the entire declared surface. Do not spawn a subagent or delegate a concern.

The unit the law governs is one declared surface, not one person. What the law forbids is splitting one declared surface across reviewers.

Apply [AGENTS.md's **Choose the principled course** rule](../../../AGENTS.md#attitude) to every review decision. A review's duration, difficulty, and consequence surface are reasons to inspect more deeply, never reasons to pass over a sound improvement or lower the completion standard.

A complete round satisfies all four rules:

- **Whole surface:** read every changed file and hunk. For issue discovery, audit the entire campaign scope. Never partition by file, package, concern, or round.
- **Consequence surface:** inspect affected code paths, tests, CI, packaging, documentation, the evidence graph, and consumers. Trace side effects, state transitions, reconnection and replay, both harness adapters, the smallest supported geometry, Windows and POSIX behavior, public API compatibility, boundaries, and failure paths beyond the named symptom.
- **Fresh start:** use the current state and repeat the whole inspection. Earlier rounds and a recheck of only the latest fix do not count as coverage.
- **Unlimited rounds:** whenever the reviewer applies an improvement, update the work and start another complete round. Stop only after a complete round produces nothing that survives verification.

## Review records belong to the procedure

This repository has no review service, finding ledger, approval state, or waiver store. The review record is the Git and pull-request chronology produced while following this skill.

Declare the exact branch, base and head, working-tree state, and file population the round reads. A conclusion applies only to that surface. A clean check, an empty finding set, or a judgment over one file never implies a wider approval.

Write each finding at the narrowest reproducible location. Separate what was observed, what the contract requires, the resulting consequence, and any cause proved from control flow or history. An unproved cause stays a hypothesis.

Classify a verified finding by affected contract, impact, reproduction conditions, and repair priority. Impact and priority are different facts. Several manifestations may share one root cause, but each reproducing location remains evidence until the whole class is repaired.

Preserve history through commits and formal pull-request reviews. A later correction explains and supersedes an earlier finding without rewriting the earlier observation. A Self-Review `COMMENT` is a process record, never an approval or a waiver on behalf of a person.

## Self-Review

Self-Review and an unqualified review request use this workflow:

1. Establish the complete change surface, including the pull-request base-to-head diff and any uncommitted changes.
2. Perform one complete round under the Non-Negotiable Review Law. Include correctness and boundaries, determinism and purity of the reducer, reconnection and replay idempotence, both harness adapters, the smallest supported geometry, state, public API compatibility, test isolation and the coverage obligation, CI and packaging, documentation and the `.wiki/`, and the [evidence graph skill](../evidence-graph/SKILL.md) for any changed requirement, specification, citation, or graph configuration.
3. Reproduce every suspected defect before accepting it.
4. Apply every sound improvement and run the narrowest verification the owning workflow authorizes.
5. If anything changed, restart at step 1 as a fresh full round.
6. Finish only when a complete round finds nothing to improve. Report the final clean round and every verification that could not run.

Self-Review does not authorize creating, pushing, updating, or merging a pull request. Those follow the [pull-request skill](../pull-request/SKILL.md).

## "It is missing" is a claim that needs its own evidence

A failed search proves a name was not found, not that a capability is absent, and least of all that its absence was unintended.

Complete all four steps before writing that something is missing.

1. Read the contract type's JSDoc. Deliberate exclusions are stated there.
2. Search the requirements and specifications in the wearer's vocabulary rather than the implementation's.
3. Check whether related fields already exist and, if they do, read why. Half a mechanism usually means the other half was deferred under another name.
4. Confirm the probe. Verify how the target is actually spelled, count consumers by exported symbol rather than by module filename, and read checked-in source rather than a generated artifact.

"It is already there" needs the same discipline, because a symbol's existence is not a path's existence. Before writing that a capability exists, confirm all four: the contract gives a caller somewhere to declare it, something in the product calls it, the caller can reach the symbol, and the result shows up on a display or in the evidence graph.

## A vendor claim is not settled by review

A reviewer cannot decide what a vendor SDK does. When a finding rests on a vendor capability, limit, or signature, it is settled by reading a current source under the [vendor research skill](../vendor-research/SKILL.md), or by measurement under the [hardware verification skill](../hardware-verification/SKILL.md), and the finding records which.

A review that asserts a vendor behavior from recall is producing a hypothesis with a review's authority attached, which is worse than producing nothing.

## Solo Issue Discovery Rounds

Use these rounds through the [issue-campaign skill](../issue-campaign/SKILL.md).

1. Audit the entire declared scope yourself. Inspect source, tests, documentation, CI, packaging, the evidence graph, and open and closed issue and pull-request history. Audit the current implementation against the development skill's **Forbidden** section. A verified violation remains meaningful even when tests pass.
2. Record every raw candidate and its evidence in the campaign knowledge base before adjudication. Do not silently discard a suspicion because it looks duplicative.
3. Reopen each candidate from primary evidence, reproduce it, trace its complete consequence surface, and prove any claimed **Forbidden** classification from purpose, control flow, and history.
4. Record accept, partial acceptance, rewrite, combine, split, reject, or defer, with the reason, so later passes do not rediscover a rejected premise as new.
5. If any meaningful candidate survived this round, return to step 1 over the entire scope at the same repository state.
6. Publish only the adjudicated form of what survived.
7. After the implementation merges, begin again at step 1 over the integrated state.

An unresolved accepted issue, an external blocker, or an incomplete implementation prevents a successful campaign conclusion. Report it as blocked rather than treating it as a clean round.
