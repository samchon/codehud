---
name: vendor-research
description: Defines how to establish what a smart-glasses SDK, coding-agent harness protocol, or platform API actually does today, what counts as a citable answer, and where findings are recorded. Use before asserting any vendor capability, limit, method signature, or availability claim, and before a design decision rests on one.
---

# Vendor Research

## Recall is a hypothesis

This project sits on smart-glasses SDKs, harness protocols, and platform APIs that change faster than any training cutoff. Recognizing the name of an SDK, a class, a flag, or a product is not knowing its current state, and partial familiarity is exactly what makes an out-of-date answer sound authoritative.

Every vendor claim entering a decision, a document, or a comment is read from a current source first. This has already changed the shape of the product twice in one session: an early conclusion that the vendor web runtimes could not be used at all was wrong, and the later conclusion that they could be used was wrong for a different reason. Both were settled by reading, not by recalling.

## What counts as a citable source

Ranked. Use the highest rank that can answer the question, and say which rank you used.

1. **The installed artifact.** The package in `node_modules`, the AAR, the binary's `--help`, the type declarations on disk. This is the only source that cannot be stale relative to what the code will actually run against.
2. **First-party current documentation,** fetched now. Vendor documentation sites move and redirect; record the URL that actually served the content, not the one you requested.
3. **First-party source or samples,** when the vendor publishes them.
4. **A third-party ecosystem map or a shipped community project.** Useful for finding what to verify and for learning that something is possible at all. Never sufficient on its own for a capability claim, a signature, or a limit.

A search-result summary is rank 5 and is not citable. It is a pointer to a source, and the source is what gets read.

## Distinguish what the source says from what you concluded

Write "not stated" when a source does not answer. Do not convert silence into a negative or a positive.

Separate three things in any research record:

- what the source states, quoted or closely paraphrased with its URL;
- what follows from it by reasoning you can show;
- what remains unknown and how it would be settled.

A limit inferred from a general rule is an inference, not documentation. When a vendor documents that a page must be served over HTTPS and says nothing about outbound connections, "plain-text local connections are blocked" is an inference from browser mixed-content behavior. Label it as one.

## Verify against the shape of the decision

Before a vendor finding decides anything, check that it answers the question the decision actually asks.

- **Where does the code run?** On the glasses, in a phone application, in a web view the vendor hosts, or on a server. Vendors describe all four as "an app".
- **What does the display surface accept?** Plain text, a structured layout, or a rendered bitmap. The answer changes the size of the native layer by an order of magnitude.
- **Which direction does the event travel?** A capability present on the device is not a capability delivered to the phone.
- **What survives backgrounding?** A connection that dies when the screen locks fails this product's central use case regardless of what it can do while in focus.
- **What does authentication require?** An API key a third-party application can hold is a different product from a consumer account sign-in it cannot.

## Record findings where the next session will read them

Put the finding in `.wiki/04-vendor-research/` with its date, the exact URLs that served it, and the rank of each source. Put the decision it produced in `.wiki/07-decisions/`. The [documentation skill](../documentation/SKILL.md) owns both locations.

A finding that changes a requirement or specification is carried into `docs/` in the same change, and the research record keeps the provenance. Research justifies a product promise; it never substitutes for one, and a citation to research does not discharge a contract.

When a finding is expensive to obtain and cheap to invalidate, say what would invalidate it. An SDK version, a documented beta flag, and a redirect target are all things that move, and a record that names them lets the next session re-check in one request instead of repeating the whole pass.

## Pull external material into `.references/`

Clone vendor documentation repositories and sample projects into `.references/`, which is ignored. Read them there rather than transcribing them into the repository.

Nothing from `.references/` ships. Copying a vendor's code or prose into `packages/` or `docs/` needs a license check and an explicit reason, and a paraphrase that tracks the original sentence by sentence is a copy.
