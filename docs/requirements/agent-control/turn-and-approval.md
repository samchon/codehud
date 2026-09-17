# Turn and Approval

## What control the wearer keeps {#agent-wearer-control}

A wearable surface offers far less than a desktop terminal. The product must let the wearer genuinely control the agent from inside that smaller set.

### What a wearer may send {#agent-wearer-commands}

The set of instructions a wearer can send to the agent must be closed, and each member must complete in one gesture or one confirmed sentence. An instruction that requires repeated editing, or assembling a free-form command, does not belong to the set.

The camera on a wearable is an input path a desktop terminal cannot match, so a wearer must be able to attach what they are looking at to an instruction.

### An approval request blocks the agent {#agent-permission-blocking}

When the agent asks for approval, the turn does not proceed until the wearer answers. The product must announce this ahead of every other display, and must keep it visible until an answer is sent.

An approval request must be paired with its answer by a request identifier. Requests can arrive back to back, so an answer must never be applied on the assumption that the most recent request is still the current one.

### Approval options are data {#agent-permission-options}

Harnesses differ in how many answers they offer and what each one means, so the options must be data an adapter reports rather than a fixed enumeration. Each option must state for itself whether it lets the agent proceed and whether it also persists to later requests of the same shape.

A persisting consent cannot have its scope read on a wearable display, so it must be shown distinctly and must not be bound to the easiest gesture.

### An answer reaches the harness in the terms it accepts {#agent-permission-answer-fidelity}

A harness may accept several shapes of answer, one per kind of request, and refuse the others without saying so. An answer in the wrong shape is worse than no answer at all: the wearer is told theirs landed and walks away, while the agent stays blocked on the question they believe they settled.

The product must express each answer in the terms the request that prompted it accepts, and must refuse to send one it has no terms for rather than sending an approximation.

### An answer whose scope cannot be displayed is not offered {#agent-permission-scope-limit}

Some answers a harness offers grant more than the request in front of the wearer: an amendment admitting a class of future commands, or access to files and the network for a whole turn. Their scope is structured data a head-up display cannot render, so a wearer choosing one cannot know what they gave.

The product must not offer such an answer on a wearable surface, whatever the harness lists as available. The request itself must still reach the wearer, and refusing it must remain possible from there, so that a wearer learns what was asked and the harness is never left waiting on a question this surface cannot answer.

### Approvals have a budget, and it is small {#agent-approval-budget}

A harness left at its default settings asks for approval every few minutes. A wearer cannot walk, cook, or hold a conversation while stopping that often, so the default configuration makes the product unusable even though every individual prompt is correct.

Opening a session must therefore carry a policy that decides which classes of action proceed unattended and which reach the wearer. Reads proceed; writes, executions, and anything that leaves the machine reach the wearer; destructive actions reach the wearer and demand a second confirmation.

The policy is a property of the session rather than a global setting, because the right answer differs between a scratch repository and one that deploys. A wearer must be able to state it when they start the work and must be able to see which policy a running session is under.

### How a turn ends {#agent-turn-outcome}

When a turn ends the product must say in one line what changed. A wearer who spent ten minutes on something else must be able to look up, read that one line, and know where things stand.

A turn the wearer stopped must be distinguishable from one that failed. Reporting a wearer's own gesture as an error destroys their sense of control.
