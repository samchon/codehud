# Normalized Stream

## The observation contract {#agent-observation-contract}

The shape and invariants a harness adapter's output must satisfy.

### Closed vocabulary, monotonic order {#spec-agent-event-vocabulary}

<!-- @evidence requirements/agent-control/harness-abstraction.md#agent-normalized-observation Refines normalized observation into a closed discriminated union with a per-session monotonic sequence. -->

An observation is a closed discriminated union whose members each correspond to one situation a wearer would act on differently. A distinction a harness makes internally that never changes the wearer's action is absorbed by the adapter and adds no member.

Every observation carries the identifier of the session it belongs to, a monotonic counter starting at zero within that session, and the host's observation time. The counter determines precedence independently of transport arrival order; the time is used only to render relative age.

A tool invocation is reported under one call identifier across its start, progress, and terminal phases, and every phase carries a one-line description already shortened for a narrow display. Producing that description is the adapter's obligation, because only the adapter knows a given harness's argument shape; it is never deferred to the projection boundary.

An observation that reports a reasoning step is distinguished from one that reports prose addressed to the wearer, because the projection boundary must be able to drop the former first when space is scarce.

### The discovery result {#spec-agent-probe-result}

<!-- @evidence requirements/agent-control/harness-abstraction.md#agent-harness-discovery Refines harness discovery into a result structure that carries both the available and the unavailable case. -->

One discovery result exists per harness family. When the harness is usable, the result carries an identifier holding the family key, a display title, the resolved absolute path of the executable, and its version when the harness reports one. When it is unusable, the result carries a reason naming the executable rather than the family.

Identifier and reason are never both present and never both absent. A harness that reports no version is available without one; a missing version is not a reason for unavailability.

### The session opening contract {#spec-agent-session-open}

<!-- @evidence requirements/agent-control/harness-abstraction.md#agent-session-lifetime Refines session lifetime into an opening contract with a mandatory working directory and optional resume. -->

Opening a session requires an absolute working directory. No default, no process working directory, and no most-recently-used path may substitute for it.

Opening optionally carries a prior conversation to resume and a requested model. Opening includes starting the harness process, so a launch failure is reported as a failure of the open rather than as a fatal observation on a session that never began.

A session exposes exactly four things: its identifier, its observation stream, instruction delivery, and termination. Termination is idempotent and succeeds for an already-terminated session.
