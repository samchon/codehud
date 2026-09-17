# Glanceable Rendering

## A glance is about two seconds {#hud-glance-budget}

That is how long a wearer gives the display before looking back at the world. Content that cannot be read in that budget was not displayed; content that demands longer while they are walking or talking is worse than nothing.

### A frame arrives already fitted {#hud-prefitted-frame}

Content is fitted to the device's width and height before it is handed over. An adapter is never left to clip overflow, because a clipped line and a finished line look identical on a waveguide.

Deciding what to drop belongs to whoever composes the content. Truncating with a visible marker, eliding a path from its left, and keeping only the newest lines of a stream are all legitimate choices; handing an adapter more than fits is not a choice but an abdication.

### Every frame states its urgency {#hud-urgency}

Not all content competes for attention equally. A frame declares whether it may wake a sleeping display and whether it may speak, and that declaration is mandatory rather than defaulted.

The declaration is what connects display composition to the attention rules: a frame's grade is the same fact the notification behavior acts on, so the two can never disagree about whether a wearer should be interrupted.

### Reducer state knows nothing about the device {#hud-device-independent-state}

The state folded from agent observations never consults column count, row count, color, vendor, or input channels. Two devices watching one session share that state and each compose the content their own surface can carry.

This separation is what lets a recorded observation stream be replayed with no hardware, no socket, and no clock, and have the display decisions come out identical. Without it, the most important logic in the product would be testable only while wearing something.

### History is reviewable without leaving the glasses {#hud-reviewable-history}

A wearer who looks up after ten minutes must be able to move back through what happened: the messages, the tool calls, and the turn summaries, in order. The display is a viewer, not only a ticker.

Because speech is the only instruction channel, review navigation must be fully reachable by voice. A device that also reports touch may offer it as an accelerator, but no part of the history may be reachable only by touching something.

Review is a client-side operation over state the client already holds. Moving back through history must never cost an agent turn, a network round trip, or money.
