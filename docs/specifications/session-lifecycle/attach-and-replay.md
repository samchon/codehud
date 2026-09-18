# Attach and Replay

## Session lifetime {#session-lifetime-contract}

A session's lifetime is bound to the bridge process and to explicit instruction, never to a client connection.

### Detachment is not termination {#spec-session-detach-semantics}

<!-- @evidence requirements/session-continuity/reconnect-and-replay.md#session-outlives-socket Refines session survival into a lifetime bound to the bridge and to explicit close, never to connection state. -->

A session's lifetime is bound to the bridge process and to an explicit close instruction. Losing a client connection detaches that client and changes nothing about the session: the harness keeps running, observations keep accumulating, and a pending approval stays pending.

The bridge retains each session's observations from the first, so a returning client can be served from any counter it names. A client's disappearance never causes the bridge to discard observations it might still need.

Several clients may attach to one session simultaneously; each is served independently from the counter it names.

### Replay converges {#spec-session-replay-convergence}

<!-- @evidence requirements/session-continuity/reconnect-and-replay.md#session-idempotent-replay Refines idempotent replay into a convergence property of the fold and a monotonic guard on the display state. -->

An attaching client names the lowest observation counter it still needs, and the bridge resends from there in order. Folding a stream that contains observations the client already folded yields exactly the state folding each once would yield.

The guard is a comparison: an observation whose counter is at or below the highest already folded is discarded rather than applied. A late observation therefore cannot rewind the display, and no ordering assumption is placed on the transport.

### Handoff preserves identity {#spec-session-handoff-identity}

<!-- @evidence requirements/session-continuity/reconnect-and-replay.md#session-handoff Refines handoff into shared session identity between the wearable client and the host terminal with no reconciliation step. -->

A session opened by the wearable is identified in the harness's own terms, so the same session can be resumed at a terminal on the host machine. A session started at that terminal is discoverable by the wearable and attachable by identifier.

Neither surface owns the session. Whichever attaches sees the same history, the same pending approval, and the same working directory, and no reconciliation, export, or merge step exists for the wearer to perform.

A surface that attaches while another holds a pending approval sees that approval and may answer it. The answer is paired by request identifier, so exactly one answer takes effect regardless of which surface produced it.

### Resuming opens the prior conversation, not a new one {#spec-session-resume-identity}

<!-- @evidence requirements/session-continuity/reconnect-and-replay.md#session-handoff Refines handoff into a requirement on what an adapter does with a prior conversation's identifier, since a copy carrying that identifier would satisfy every other rule here. -->

An adapter handed a prior conversation's identifier opens that conversation in the harness's own terms. Starting a new conversation and reporting it under the identifier that was asked for is a violation, not an approximation: every other property here holds for the copy, and the wearer learns otherwise only from work that is missing.

The overrides a session states — working directory, permission policy, model — travel with a resume as with a fresh open. A resumed conversation runs under the policy stated by the session resuming it.

### The bridge advertises what it holds {#spec-session-advertised-population}

<!-- @evidence requirements/session-continuity/reconnect-and-replay.md#session-outlives-socket Refines session survival into a rule about which sessions a bridge advertises, distinguishing a live session from a resumable record of one. -->

A bridge advertises the live sessions it holds and no others. A harness family may keep its own registry of conversations, live or persisted, and that registry is not merged into the advertisement: the bridge cannot deliver observations for a conversation it does not hold, and advertising one would offer a wearer an attachment that cannot be honoured.

A persisted conversation is not a session. It is reachable by resuming it under its harness identifier, which is the path handoff already uses, and remains reachable whether or not any bridge is running.

What is advertised carries the policy each session was opened under. The second confirmation is applied by the device rather than by either harness, and the device answering a request need not be the one that opened the session; a surface that joined has no other way to learn which requests its wearer must answer twice. Advertising the policy is what makes it a property of the session rather than of whoever opened it.
