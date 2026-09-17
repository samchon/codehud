# Control and Approval

## The instruction contract {#agent-command-contract}

What the wearer may send to the agent, and the conditions its delivery must satisfy.

### Closed instruction vocabulary {#spec-agent-command-vocabulary}

<!-- @evidence requirements/agent-control/turn-and-approval.md#agent-wearer-commands Refines what a wearer may send into a closed instruction union with three members. -->

An instruction is a closed discriminated union with exactly three members: a new prompt, an approval answer, and an interruption. Each completes in one gesture or one confirmed sentence.

A prompt carries the sentence the wearer confirmed and, optionally, images captured by the device camera in a form ready to attach. An unconfirmed interim recognition result can never be submitted as a prompt.

### Blocking and pairing {#spec-agent-permission-pairing}

<!-- @evidence requirements/agent-control/turn-and-approval.md#agent-permission-blocking Refines the blocking property of approval requests into request-identifier pairing and a single-pending rule. -->

An approval observation carries a request identifier, and an approval instruction quotes that identifier verbatim. An answer that quotes no identifier, or an identifier the system does not recognize, is refused and applied to nothing.

At most one approval request is pending before the wearer at a time. When a harness issues several in succession the projection boundary serializes them, and a pending request remains displayed until its answer has been delivered.

### Self-describing options {#spec-agent-option-self-description}

<!-- @evidence requirements/agent-control/turn-and-approval.md#agent-permission-options Refines approval options as data into a structure where each option states its own advancing and persisting properties. -->

Each option carries an identifier, a short label sized for a narrow display, whether choosing it lets the agent proceed, and whether it also persists to later requests of the same shape. Advancement and persistence are declared facts, never inferred from the label text.

An option that persists is not bound to the input requiring the least effort. The projection boundary assigns inputs by this rule regardless of the order the harness listed them.

### An answer is written in its own request's vocabulary {#spec-agent-answer-vocabulary}

<!-- @evidence requirements/agent-control/turn-and-approval.md#agent-permission-answer-fidelity Refines answering in the terms the harness accepts into a per-request-kind vocabulary that an adapter selects by the request being answered. -->

An adapter records, for every pending approval request, which kind of request it was, and composes the answer in the vocabulary that kind accepts. The kinds a harness family exposes need not share an answer shape, and an adapter treats them as distinct rather than as one shape with variations.

An option identifier is resolved against the answers offered for that kind alone. An identifier valid for another kind is refused, applied to nothing, and never translated into something the harness would accept.

### The offered answers are the adapter's own {#spec-agent-offered-answers}

<!-- @evidence requirements/agent-control/turn-and-approval.md#agent-permission-scope-limit Refines the display-scope limit into a rule governing which of a harness's available answers an adapter reports. -->

The options an adapter reports are chosen by the adapter. A list of available answers supplied by the harness on the request is not mirrored: an answer that persists beyond the request, and an answer that amends a policy or grants access for longer than the request, are excluded whether or not the harness offers them.

A request whose every affirmative answer is excluded is still reported, carrying its refusal alone, and the refusal is a well-formed answer in that request's own vocabulary. Every reported request carries a refusal, so no request reaches a wearer that they cannot clear.

### The session permission policy {#spec-agent-permission-policy}

<!-- @evidence requirements/agent-control/turn-and-approval.md#agent-approval-budget Refines the approval budget into a per-session policy that classifies actions into unattended, attended, and doubly-confirmed. -->

Opening a session carries a permission policy that partitions harness actions into three classes: those that proceed unattended, those that raise an approval request, and those that raise an approval request and additionally require a second confirmation phrased differently from the first.

Reads default to unattended. Writes, executions, and any action that leaves the host machine default to attended. Deletion, history rewriting, force publication, and credential exposure default to doubly-confirmed.

The policy is a property of one session, not of the installation. The system reports the policy in force on a running session when asked, and the wearer states it when the work begins.

### Reporting a turn's end {#spec-agent-result-report}

<!-- @evidence requirements/agent-control/turn-and-approval.md#agent-turn-outcome Refines how a turn ends into a result observation with three terminal states and a one-line summary. -->

A turn-end observation carries one of three terminal states (success, error, or wearer interruption), a one-line summary stating what changed, and elapsed time. It carries cost only when the harness reported one; an unreported cost is absent and is never rendered as zero.

Wearer interruption is a distinct terminal state from error, and the projection boundary never renders it as a failure.
