# Attention and Quiet

## Interrupting a wearer has a cost {#notification-cost-of-attention}

This display sits in front of someone's eye while they walk, talk, and work. Every time it lights up it takes attention from whatever they were actually doing. A product that spends that attention carelessly gets taken off and left on a desk.

### Three grades and nothing between {#notification-three-grades}

Every alert carries exactly one of three grades, and the grade determines what the device is allowed to do.

A *demand* may wake a sleeping display and may speak. It is reserved for an approval request that has blocked the agent and for a fault that ended a session. A *notice* may wake the display silently; a finished turn is a notice. *Ambient* may not wake anything; progress belongs here.

There is no fourth grade and no ungraded alert. A message with no stated grade is a bug, not a default.

### Every alert names its session {#notification-names-session}

A wearer runs several agents across several repositories at once. An approval request that does not say which repository it would modify is not answerable, because "allow" means something different in each one.

The identifying fact is the working directory, shortened from the left so the part that distinguishes survives. It appears on every demand-grade alert without exception, even when it costs the only other line on the display.

### Silence must be available {#notification-quiet-mode}

A wearer in a meeting, a conversation, or a cinema must be able to silence the product without stopping the work. Quiet mode suppresses waking and speech at every grade, including demand.

Suppressed demands are not discarded. They accumulate and are presented together when quiet mode ends, still blocking their sessions, still answerable. An agent that was waiting is still waiting.

### An unseen alert must survive {#notification-fallback}

The glasses are frequently not on the wearer's face. When the device is disconnected, asleep beyond reach, or in quiet mode, a demand-grade alert must still reach the wearer through the phone that hosts the client.

The product never resolves an unanswered approval on the wearer's behalf. There is no timeout that becomes a denial and none that becomes an allowance: an agent waits until a person answers, because both defaults are wrong and the wrong one is unrecoverable.
