---
name: issue-campaign
description: Defines the solo issue campaign for glasses: exhaustive discovery, wiki-backed adjudication, issue publication, then one issue at a time through implementation, Self-Review, CI, and merge, followed by renewed discovery. Use for broad audits, many issue candidates, or for working the published issue list; do not use for an ordinary one-off pull request.
---

# Issue Campaign

A campaign is a repeatable sequence: exhaustive discovery, adjudication, publication, then conquest of the published list one issue at a time, then discovery again over the integrated state.

Every phase is solo. Splitting discovery hides the overlaps that make two candidates one issue, and splitting implementation across a shared branch hides what appears between assignments.

## Phases

| Phase | Owner | Ends when |
| --- | --- | --- |
| Discovery and adjudication | Solo, under the [review skill's discovery rounds](../review/SKILL.md#solo-issue-discovery-rounds) | A complete round adds no meaningful candidate |
| Publication | Solo | Every surviving candidate is a GitHub issue with its labels and its evidence |
| Conquest | Solo, one issue per pull request | Every issue in the wave is merged or recorded as blocked |
| Renewal | Solo | Discovery begins again over the merged state |

## Publication

Publish the adjudicated form of what survived, and only that. An issue carries what it is, why it is real, what it blocks or realizes, and its labels.

Keep the staging register in `ISSUES.md` and file from it, so the register and the published issues can be diffed later. The register is not a decision record; decisions live in `docs/` and in `.wiki/07-decisions/`.

Label set: `hardware` (only the device can settle it), `decision` (an open fork), `core` (pure TypeScript), `native` (Kotlin or React Native), `infra`, `risk` (an unverified assumption that could invalidate design).

## Conquest order

Work the list in dependency order, not in numeric order. Three rules decide it:

1. **A blocker precedes what it blocks.** An issue that says "Blocks: X" is worked before X.
2. **A `decision` precedes the `core` work that encodes it.** Implementing a fork before it is settled produces code that has to be rewritten, and the rewrite is invisible to the issue that caused it.
3. **A `hardware` issue does not block core work that a simulator can exercise.** Measurement is scheduled when the device is available; the reducer, the bridge, and the adapters are built and tested without it.

When an issue cannot proceed, record the blocker on the issue and move to the next. Do not partially implement a blocked issue to show progress.

## One issue, one pull request

Each issue is conquered through the [pull-request skill](../pull-request/SKILL.md) as its own topic-unit PR, and the PR body names the issue with a closing keyword.

The cycle per issue:

1. Read the issue and the contract units it names. Re-read the requirement and specification text rather than trusting the issue's summary of it.
2. Implement under the [development skill](../development/SKILL.md), including the coverage obligation and the evidence citations the change owes.
3. Run the narrowest verification that proves it, then `pnpm run build`, `pnpm run test`, and `pnpm run evidence`.
4. Self-Review under the [review skill](../review/SKILL.md) until a complete round is clean.
5. Push, read the checks, repair until green.
6. Merge, then observe the post-merge checks on the merge commit.

An issue whose implementation reveals a second, separable defect does not absorb it. File the new issue, reference it from the current PR, and keep the topic intact.

## Discovery finds what the list did not

The published list is a snapshot of one adjudication. Renewal exists because implementation teaches things adjudication could not know: a contract unit that no symbol can truthfully cite, an adapter boundary that leaks, a specification that two implementations read differently.

Record each of those as a campaign finding in `.wiki/08-campaigns/` when it is observed, even while implementing something else, and adjudicate it in the next discovery phase rather than acting on it immediately.

## Completion

A wave concludes when every issue in it is merged or recorded as blocked with its blocker named. An unresolved accepted issue or an incomplete implementation prevents a successful conclusion; report it as blocked or active rather than as a clean wave.
