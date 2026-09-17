---
name: evidence-graph
description: Defines the committed trace from product requirements through system specifications to public source exports for glasses, its @wrtnlabs/evidence populations, citations, exclusions, stable anchors, and the review of the required triangle. Use before adding, moving, or reviewing a contract document, changing a public export's evidence JSDoc, or reshaping evidence.config.ts.
---

# Evidence Graph

## Contract layers

Keep the committed contract in three layers.

| Layer | Owns | Does not own |
| --- | --- | --- |
| `docs/requirements/` | Product promises a wearer can observe, request, or judge | Package design, symbol names, implementation procedure |
| `docs/specifications/` | System contracts that make those promises precise | Package ownership, API reference, contributor tutorial |
| Public source JSDoc | The implementation identity and why it carries its contracts | A second requirements or specifications corpus |

Write specifications around system boundaries, state, invariants, inputs, outputs, failures, and compatibility. Do not organize them by package name; one specification may be implemented by several symbols in several packages.

Do not create `docs/packages/`. Package usage belongs in package READMEs and exported API detail belongs in JSDoc.

Keep `.wiki/` and `.references/` outside the committed contract population. They justify decisions and preserve working knowledge; a citation to research does not discharge a product promise.

## Required triangle

Three positive edge families are configured and validated:

```text
specification -> requirement
public source -> specification
public source -> requirement
```

Every requirement unit receives positive specification evidence. Every specification unit cites the requirements it makes precise. Every selected public source symbol cites at least one requirement and at least one specification that it materially implements.

For each direct source-to-requirement edge, at least one specification cited by that same source must reach the same requirement. A source citing two unrelated documents is not consistent merely because both citations resolve.

Trace that path in Self-Review from resolved unit identities and configured edges, then read the source, the specification, and the requirement and verify they express the same implemented behavior. Matching words, folder names, and package ownership establish nothing.

Do not set `uniqueEvidence` on a specification reference to manufacture an owner. Shared implementation is valid. Do not set `singleEvidencePerSymbol` where a real symbol or section can answer for more than one unit.

## The tool is cross-language on purpose

The graph runs through `@wrtnlabs/evidence` from the workspace root rather than through a per-package lint plugin, because the product's device adapter has a native layer and a graph that stopped at TypeScript would exclude the code most likely to drift.

`@ttsc/lint` keeps the type-aware hygiene rules in each package's `lint.config.ts`: `evidence/singular` for one public identity per file, `evidence/documented` for a JSDoc carrier on every export that could hold a citation, and `evidence/todo` for unrealized work. Those are a different obligation from the graph and stay enabled either way.

| Owner | Responsibility |
| --- | --- |
| `@wrtnlabs/evidence` | Evaluate the configured graph relationships across every language in the workspace. Its diagnostics are the dependency contract. |
| `@ttsc/lint` with `@ttsc/evidence` | Enforce single public identity, documentation carriers, and absence of `@todo`, inside the type-aware build. |
| Semantic Self-Review | Read the actual carrier, target, reason, and downstream behavior. Confirm the citation is truthful, not merely resolvable. |

A passing configured check records that check's result. It does not establish that every product promise is implemented or that any citation is true.

## Derive the carrier population

Derive the complete carrier population from a source glob. Never define that set as a union of hand-written paths: a listed population makes "owes no evidence" the default for every file added after the list was written, and nothing reports the omission.

Write each whole-population exclusion as a negative pattern beside the positive one and state in the config's JSDoc why that file owes no contract. Two reasons are currently accepted: a barrel re-exports declarations that already answer at their definition, and a process entry point is not a contract carrier.

Cross every directory depth. A one-level glob admits only the top directory. Pattern order decides the result: a later positive pattern re-admits what an earlier negative removed.

## Anchors are the identity

Every H2 and H3 in a contract document carries an explicit ASCII anchor. The anchor and the meaning attached to it are the unit identity. Prose may be rewritten freely; changing an anchor breaks every citation that names it and is a contract change, not an edit.

Give a behavior its own H3 with its own anchor when it can mature, fail, or be implemented independently. `evidence/graph` proves a unit has a claimant; it cannot prove that several partial claimants add up to the whole unit. If no single citation truthfully implements a unit, the unit is too broad and is split before it is cited.

Leave a unit nobody implements without a positive carrier rather than excluding it. An exclusion states that the claim intentionally owes nothing, and spending one on unfinished work hides a product gap behind a decided boundary.

## Widening the graph is its own change

The source claims currently select `symbol: ["type"]`. Widening to `property` multiplies the citation obligation across every field of every contract type, so it is a deliberate topic with its own issue rather than something a feature change does on the way past.

When the requirement set stops moving, widen it, and expect the first run to report a large missing count. That count is the task list, not a reason to narrow the selector back.
