# Frame and State

## The projection contract {#projection-contract}

Projection is two stages: folding observations into device-independent state, and composing that state against one device's geometry.

### Content is produced already satisfying the geometry {#spec-projection-frame-fits}

<!-- @evidence requirements/head-up-display/glanceable-rendering.md#hud-prefitted-frame Refines the pre-fitted frame requirement into a total invariant that produced content never exceeds the declared geometry. -->

Display content is a list of lines plus an optional footer. No line exceeds the declared column count, and the number of lines plus the footer's presence does not exceed the declared row count. This holds for every content kind and every geometry, including two rows and a single row.

Choosing what to drop belongs to the composition stage. Truncation with a visible marker, eliding a path's leading segments, and keeping only the newest wrapped lines of streaming prose are each applied where they fit the situation; in no case is over-length content handed to an adapter.

A footer exists only when an input is actually bound to what it names. Naming a gesture or phrase that does nothing is worse than naming nothing.

### Every frame carries a mandatory grade {#spec-projection-urgency-grade}

<!-- @evidence requirements/head-up-display/glanceable-rendering.md#hud-urgency Refines the urgency requirement into a mandatory three-valued field that is the same fact the notification contract acts on. -->

Display content carries exactly one of three grades: ambient, notice, or demand. The field is not optional and is not defaulted.

The grade a frame carries is the same fact the notification contract consumes, so composition and attention cannot disagree about whether the wearer is interrupted. An approval request and a fatal fault carry demand; progress carries ambient.

Content carries a key derived from its visible content, and the adapter skips drawing when the key matches what is on screen.

### The folded state is geometry-blind and pure {#spec-projection-state-purity}

<!-- @evidence requirements/head-up-display/glanceable-rendering.md#hud-device-independent-state Refines device-independent state into purity conditions and an input restriction on the fold function. -->

The state folded from observations references no column count, row count, color availability, manufacturer, or input channel. The fold takes the prior state and one observation, returns a new state, and reaches no clock, random source, input, output, or mutable global.

Two devices attached to one session share that state and compose different content from their own geometries. This purity is the condition that lets a recorded observation stream reproduce every display decision without hardware, socket, or clock.

The state holds at most one pending approval request and clears it the moment the wearer answers, without waiting for harness confirmation, because the interval between an answer and the next observation is long enough for a wearer to speak again and answer the following request by mistake.

### Review is a client-side traversal of held state {#spec-projection-review-traversal}

<!-- @evidence requirements/head-up-display/glanceable-rendering.md#hud-reviewable-history Refines reviewable history into a bounded client-side cursor over retained state with no scroll primitive assumed from the device. -->

The state retains an ordered, bounded history of prose messages, tool invocations, and turn results, and composition takes a cursor into it. Moving the cursor is a local state change: it consumes no agent turn, issues no network request, and works while the bridge is unreachable.

The system assumes no scroll container on the device. Composition recomputes the visible window from the cursor and emits ordinary content, so review works identically on a device whose display primitives are a fixed layout with replaceable text.

Cursor movement is reachable through speech alone. Where a touch surface is declared, it may move the same cursor, and it exposes no position the voice route cannot also reach.
