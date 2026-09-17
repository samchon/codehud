# Charter Refinement

## Product invariants {#product-invariants}

The charter's promises restated as conditions other boundaries can be checked against.

### The wearable minimum set {#spec-product-wearable-minimum}

<!-- @evidence requirements/product/charter.md#product-wearable-coding-agent Fixes the four operations the charter promises as a minimum capability set the system must expose on the wearable alone. -->

The system provides all four of progress observation, approval response, new instruction, and turn interruption through the wearable surface alone. Each must be reachable through at least one path composed of capabilities the connected device declared, and a device configuration that leaves any of the four unreachable is not supported.

Observation and review are eye operations; instruction is a voice operation. No contract in this system accepts typed characters from the wearer on any surface, and none may be added.

### Axis independence {#spec-product-axis-independence}

<!-- @evidence requirements/product/charter.md#product-two-adapter-axes Refines the promise that the two adapter axes do not know about each other into a checkable constraint on type dependency direction. -->

The harness axis contract references no display geometry, no input gesture, and no manufacturer identifier. The device axis contract references no harness family, no observation kind, and no instruction kind. Exactly one layer knows both axes, the projection boundary, and it belongs to neither.

A change that adds a member to one axis and requires editing the other axis's contract or the projection rules is rejected.

### Local completeness {#spec-product-local-completeness}

<!-- @evidence requirements/product/charter.md#product-no-hosted-server Refines the no-hosted-server promise into the condition that no remote endpoint appears in any contract, and records which harness surface that selects. -->

No member of the product contract requires a third-party endpoint, an account identifier, an issued-token service, or remote storage. The only address the transport contract knows is one host reachable on a network the user already controls.

The harness the system drives is therefore the one that executes on that host. The vendors' hosted agent surfaces are excluded from the contract: they meter against per-token billing rather than the subscription the user holds, and at least one of them enforces no approval gate on the agent's own sandbox actions, which the approval contract requires. That a user-chosen harness independently contacts its own model provider is outside this product rather than an exception to it.

### Where judgement lives {#spec-product-judgement-locus}

<!-- @evidence requirements/product/charter.md#product-not-an-agent Refines the boundary that the product does not replace the agent into a limit on what content the system may originate. -->

The system reduces observations and relays instructions. It does not synthesize tool calls, invent approval options, or send instructions the wearer did not speak.

Every phrase the system displays is either a reduction of a fact the harness reported or a statement of the system's own connection state. Nothing else exists in the contract.
