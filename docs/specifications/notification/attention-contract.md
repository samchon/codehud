# Attention Contract

## Spending the wearer's attention {#notification-contract}

What each grade permits a device to do, and what happens when the wearer is not reachable.

### Three grades with fixed permissions {#spec-notification-grade-permissions}

<!-- @evidence requirements/notification/attention-and-quiet.md#notification-three-grades Refines the three grades into a fixed permission table over waking and speaking. -->

Demand may wake a sleeping display and may speak. Notice may wake a sleeping display and may not speak. Ambient may do neither.

Demand is reserved for an approval request that has blocked a session and for a fault that ended one. A finished turn is a notice. Progress within a turn is ambient. No other assignment exists, and content with no grade is a defect rather than an implicit ambient.

Grade permissions are the upper bound on device behavior, not a request; an adapter may do less when the device cannot do more, never more than the grade permits.

### Demand-grade content is addressed {#spec-notification-session-addressing}

<!-- @evidence requirements/notification/attention-and-quiet.md#notification-names-session Refines session naming into a mandatory identifying line on every demand-grade frame. -->

Every demand-grade frame states the working directory of the session it concerns, shortened from the left so that the distinguishing trailing segments survive. It appears even when the display has room for nothing else, because an approval whose target repository is unknown is not answerable.

Where several sessions are attached, the identity is required for a notice as well when the notice concerns a session other than the one in focus.

### Suppression defers rather than discards {#spec-notification-quiet-suppression}

<!-- @evidence requirements/notification/attention-and-quiet.md#notification-quiet-mode Refines quiet mode into suppression of waking and speech at every grade, with deferred delivery and unchanged session state. -->

Quiet mode removes the waking and speaking permissions from every grade including demand. It changes presentation only: a suppressed approval request still blocks its session and remains pending and answerable.

Suppressed demand-grade items accumulate in order and are presented together when quiet mode ends. None is dropped, coalesced away, or resolved by the system.

What accumulates is what quiet mode suppressed, and nothing else. An item a disconnected or sleeping device missed is not added to it: the request it concerns is still pending, so a device that returns is shown it again by the ordinary path, and mixing the two populations would present one at the moment the other ended.

### Unreachable does not mean answered {#spec-notification-fallback-delivery}

<!-- @evidence requirements/notification/attention-and-quiet.md#notification-fallback Refines fallback delivery into a host-side path for demand-grade items and a prohibition on timeout-resolved approvals. -->

When the device is disconnected, asleep beyond reach, or suppressed, demand-grade items are delivered through the host that carries the client, by whatever notification facility that host provides.

No approval request is ever resolved by elapsed time. There is no timeout that denies and none that allows; a request remains pending until a wearer answers it or the session ends. Both defaults are wrong and the wrong one cannot be undone.
