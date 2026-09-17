# Reconnect and Replay

## The wearer walks away constantly {#session-wearer-departs}

A wearable is strapped to someone who moves. Losing the connection is part of normal use rather than an exceptional case, and the product is designed on that assumption.

### A session outlives its socket {#session-outlives-socket}

Losing the wearable's connection must not end the harness session. A dropped connection means the wearer went out of range, and that must never kill work in progress.

Ending a session is an explicit instruction. A returning device reattaches to the same session and continues watching it.

### Replay is idempotent {#session-idempotent-replay}

A returning device asks only for what follows the last observation it holds, and the bridge resends from there. Even if observations it has already folded in arrive again, the display state must reach exactly the result it would have reached seeing each one once.

A late observation must never rewind the display. Showing a wearer a situation that has already passed is worse than showing them nothing, because they cannot tell it is stale.

### Work moves between the glasses and the desk {#session-handoff}

A session started by voice on the glasses must be resumable at the terminal on the machine that hosts it, and a session started at the terminal must be attachable from the glasses. The same work, not a copy of it.

This is the shape the product is actually used in: direction is set while walking, and depth happens at a keyboard. A session that can only be driven from where it was created forces the wearer to choose in advance which half of that they wanted.

Handoff must not require the wearer to reconcile anything. Whichever surface picks the session up sees the same history, the same pending approval, and the same working directory.
